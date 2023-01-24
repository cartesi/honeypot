// Copyright 2023 Cartesi Pte. Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use
// this file except in compliance with the License. You may obtain a copy of the
// License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed
// under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
// CONDITIONS OF ANY KIND, either express or implied. See the License for the
// specific language governing permissions and limitations under the License.
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

import * as cast from "./cast";

import * as graphql from "./rollups/graphql";

import { PollingServerManagerClient } from "./rollups/rollups";

import {
    CommandOutput,
    hex2str,
    logger,
    LogLevel,
    setTestOptions,
    getTestOptions,
} from "./util";

import { InputReceipt } from "./types";

const PROJECT_NAME = require("project-name");

// TODO Move SERVER_MANAGER_PROTO to rollups/rollups.ts
const SERVER_MANAGER_PROTO = "./grpc-interfaces/server-manager.proto";

//TODO Make addresses configurable
const ALICE_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const BOB_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// Honeypot DApp operation/error codes
enum OP {
    DEPOSIT_PROCESSED = "0x00",
    VOUCHER_ISSUED = "0x01",
    NO_FUNDS = "0x02",
    INVALID_INPUT = "0x03",
}

let serverManager: PollingServerManagerClient;

const testConfig = setTestOptions(process.argv);
logger.logLevel = LogLevel.VERBOSE;//testConfig.logLevel;

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Integration Tests for " + PROJECT_NAME(), () => {
    before(async function () {
        serverManager = new PollingServerManagerClient(
            testConfig.serverManagerAddress,
            SERVER_MANAGER_PROTO
        );
        logger.log("    Waiting for server manager...");
        expect(
            await serverManager.isReady(testConfig.pollingLimit),
            "Failed to connect to Server Manager"
        ).to.be.true;
        logger.log("    Server manager ready!");
    });

    it("Valid input should be rejected due to lack of funds", async () => {
        let dappBalance = await cast.getBalance(testConfig.dappAddress);
        expect(dappBalance.eq(0));

        let receipt: InputReceipt = await cast.sendInput(
            BOB_ADDRESS,
            "Lack of funds"
        );
        const reports = await graphql.getReports(receipt);
        expect(reports.length).to.eq(1);

        const reportPayload: string = hex2str(reports[0].payload);
        expect(reportPayload.startsWith(OP.NO_FUNDS));
    });
});
