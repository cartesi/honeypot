// Copyright Cartesi Pte. Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use
// this file except in compliance with the License. You may obtain a copy of the
// License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed
// under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
// CONDITIONS OF ANY KIND, either express or implied. See the License for the
// specific language governing permissions and limitations under the License.
import { RequestOptions } from "http";
import * as grpc from "@grpc/grpc-js";
import { ServiceError } from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ProtoGrpcType } from "../dist/generated-src/proto/server-manager";
import { GetEpochStatusRequest } from "../dist/generated-src/proto/CartesiServerManager/GetEpochStatusRequest";
import { GetEpochStatusResponse } from "../dist/generated-src/proto/CartesiServerManager/GetEpochStatusResponse";
import { GetSessionStatusRequest } from "../dist/generated-src/proto/CartesiServerManager/GetSessionStatusRequest";
import { GetSessionStatusResponse } from "../dist/generated-src/proto/CartesiServerManager/GetSessionStatusResponse";
import { ProcessedInput } from "../dist/generated-src/proto/CartesiServerManager/ProcessedInput";
import { ServerManagerClient } from "../dist/generated-src/proto/CartesiServerManager/ServerManager";
import path from "path";

import {
    CommandOutput,
    ErrorCodes,
    getTestOptions,
    hex2str,
    logger,
    sendRequest,
    timer,
} from "../util";

const CONFIG = getTestOptions();

//gRPC
export class PollingServerManagerClient {
    private client: ServerManagerClient;

    constructor(client: ServerManagerClient);
    constructor(address: string, pathToProto: string);
    constructor(...args: any[]) {
        switch (args.length) {
            case 1: {
                this.client = args[0];
                logger.verbose(`Using provided server manager gRPC client`);
                break;
            }
            case 2: {
                const address = args[0];
                const protoFile = args[1];

                const definition = protoLoader.loadSync(protoFile);
                const proto = grpc.loadPackageDefinition(
                    definition
                ) as unknown as ProtoGrpcType;

                this.client = new proto.CartesiServerManager.ServerManager(
                    address,
                    grpc.credentials.createInsecure()
                );

                logger.verbose(
                    `Created server manager gRPC client with URL: ${address}`
                );
                break;
            }
            default:
                throw new Error("Undefined constructor");
        }
    }

    async isReady(timeout: number): Promise<boolean> {
        let count = 0;
        do {
            await timer(1);
            try {
                logger.verbose(`Attempt: ${count}`);
                await this.getEpochStatus(0);
                return true;
            } catch (error: any) {
                if (
                    error.code != ErrorCodes.SESSION_ID_NOT_FOUND &&
                    error.code != ErrorCodes.CONCURRENT_CALL &&
                    error.code != ErrorCodes.NO_CONNECTION
                ) {
                    throw error;
                }
            }
            count++;
        } while (count < timeout);
        return false;
    }

    async getProcessedInputs(
        epoch: number,
        timeout: number,
        expectedInputCount: number
    ): Promise<ProcessedInput[]> {
        let count = 0;
        let status: GetEpochStatusResponse;
        do {
            await timer(1);
            try {
                logger.verbose(`Attempt: ${count}`);
                status = await this.getEpochStatus(epoch);

                let pendingInputsCount = status.pendingInputCount ?? 0;
                let processedInputsCount = status.processedInputs?.length ?? 0;

                if (
                    pendingInputsCount == 0 &&
                    processedInputsCount >= expectedInputCount
                ) {
                    return status.processedInputs ?? [];
                }
            } catch (error: any) {
                if (error.code != ErrorCodes.CONCURRENT_CALL) {
                    throw error;
                }
            }
            count++;
        } while (count < timeout);
        throw new Error("Timed out waiting Server Manager to process inputs");
    }

    async getEpochStatus(
        index: number,
        sessionId = "default_rollups_id"
    ): Promise<GetEpochStatusResponse> {
        let request: GetEpochStatusRequest = {
            sessionId: sessionId,
            epochIndex: index,
        };

        return new Promise((resolve, reject) => {
            this.client?.getEpochStatus(
                request,
                (
                    err: grpc.ServiceError | null,
                    output: GetEpochStatusResponse | undefined
                ) => {
                    if (err || !output) {
                        logger.verbose(err);
                        reject(err);
                    } else {
                        logger.verbose(output);
                        resolve(output);
                    }
                }
            );
        });
    }

    async getSessionStatus(
        sessionId = "default_rollups_id"
    ): Promise<GetSessionStatusResponse> {
        let request: GetSessionStatusRequest = {
            sessionId: sessionId,
        };

        return new Promise((resolve, reject) => {
            this.client.getSessionStatus(
                request,
                (
                    err: ServiceError | null,
                    output: GetSessionStatusResponse | undefined
                ) => {
                    if (err || !output) {
                        logger.log(err);
                        reject(err);
                    } else {
                        logger.verbose(output);
                        resolve(output);
                    }
                }
            );
        });
    }
}

export const isQueryServerReady = async (timeout: number): Promise<boolean> => {
    let count = 0;
    do {
        await timer(1);
        try {
            logger.verbose(`Attempt: ${count}`);
            const ping = await pingQueryServer();
            if (ping) return true;
        } catch (error: any) {
            if (error.code != "ECONNRESET" && error.code != "ECONNREFUSED") {
                throw error;
            }
        }
        count++;
    } while (count < timeout);
    return false;
};

function pingQueryServer(): Promise<boolean> {
    const options = {
        hostname: "localhost",
        port: 4000,
        path: "/graphql",
        method: "GET",
    };

    return sendRequest(options);
}

export async function assertEpoch(
    epoch: number,
    client: PollingServerManagerClient,
    pollingLimit: number
) {
    let count = 0;
    let status: GetSessionStatusResponse;
    do {
        await timer(1);
        try {
            logger.verbose(`Attempt: ${count}`);
            status = await client.getSessionStatus();
            if (status.activeEpochIndex == epoch) return true;
        } catch (error: any) {
            if (error.code != ErrorCodes.CONCURRENT_CALL) {
                throw error;
            }
        }
        count++;
    } while (count < pollingLimit);
    return false;
}

//TODO Capture epoch after advancing
export const advanceEpoch = async (time = 864010): Promise<void> => {
    await _hardhatAdvanceTime(time);
    await _hardhatEvmMine();
};

const _hardhatAdvanceTime = async (time: number): Promise<void> => {
    const data = JSON.stringify({
        id: 1337,
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time],
    });
    const options: RequestOptions = {
        hostname: "localhost",
        port: 8545,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": data.length,
        },
    };

    await sendRequest(options, data);
};

const _hardhatEvmMine = async (): Promise<void> => {
    const data = JSON.stringify({
        id: 1337,
        jsonrpc: "2.0",
        method: "evm_mine",
    });
    const options: RequestOptions = {
        hostname: "localhost",
        port: 8545,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": data.length,
        },
    };

    await sendRequest(options, data);
};

export const inspect = async (query: string): Promise<string> => {
    const url = path.join(CONFIG.inspectServer, query);
    const response = await fetch(url);

    logger.verbose(`HTTP status: ${response.status}`);
    let payload: string = "";
    if (response.status == 200) {
        const result = await response.json();
        logger.verbose(`Inspect status: ${JSON.stringify(result.status)}`);
        logger.verbose(`Metadata: ${JSON.stringify(result.metadata)}`);
        logger.verbose(`Reports:`);
        for (let i in result.reports) {
            payload = hex2str(result.reports[i].payload);
            logger.verbose(`${i}: ${payload}`);
        }
        if (result.exception_payload) {
            payload = result.exception_payload;
            logger.verbose(`Exception payload: ${hex2str(payload)}`);
        }
    } else {
        logger.verbose(JSON.stringify(await response.text()));
    }
    return payload;
};
