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
import { ChildProcess, spawn, SpawnOptions } from "child_process";
import * as ethers from "ethers";
import { request, RequestOptions } from "http";

export const INPUT_ADDED_EVENT_HASH: string =
    "0x6aaa400068bf4ca337265e2a1e1e841f66b8597fd5b452fdc52a44bed28a0784";

export enum ErrorCodes {
    SESSION_ID_NOT_FOUND = 3,
    CONCURRENT_CALL = 10,
    NO_CONNECTION = 14,
}

export enum LogLevel {
    VERBOSE = "verbose",
    DEFAULT = "default",
}

class Logger {
    enabled = true;
    logLevel = LogLevel.DEFAULT;

    log(message: any) {
        if (this.enabled) {
            console.log(message);
        }
    }

    verbose(message: any) {
        if (this.enabled && this.logLevel == LogLevel.VERBOSE) {
            console.log(message);
        }
    }
}
export const logger = new Logger();

export const timer = (s: number) =>
    new Promise((res) => setTimeout(res, s * 1000));

export interface CommandOutput {
    stderr: string;
    stdout: string;
    process: ChildProcess;
}

export const spawnAsync = async (
    cmd: string,
    args: string[] = [],
    options: SpawnOptions = {}
): Promise<CommandOutput> => {
    const fullCmd = `${cmd} ${args.join(" ")}`;
    logger.verbose(`${fullCmd}`);

    const process = spawn(cmd, args, options);

    process.on("error", (error) => {
        throw new Error(`Failed to execute "${fullCmd}". ${error}`);
    });

    let stderr = "";
    if (process.stderr) {
        process.stderr.on("data", (data) => {
            stderr += data;
        });
    }

    let stdout = "";
    if (process.stdout) {
        process.stdout.on("data", (data) => {
            stdout += data;
        });
    }

    let exitCode = 0;
    if (options.detached) {
        process.unref();
        process.on("close", (code: number) => {
            logger.verbose(`${fullCmd} exited with code ${code}`);
        });
    } else {
        exitCode = await new Promise((resolve) => {
            process.on("close", resolve);
        });
    }

    if (exitCode) {
        throw new Error(`${fullCmd} exited with code ${exitCode}. ${stderr}`);
    }

    return {
        stdout: stdout,
        stderr: stderr,
        process: process,
    };
};

export interface TestOptions {
    serverManagerAddress: string;
    logLevel: LogLevel;
    pollingLimit: number;
    dappAddress: string;
    inputBoxAddress: string;
    erc20PortalAddress: string;
    erc20Address: string;
    castRpcEndpoint: string;
    graphQLServer: string;
    inspectServer: string;
}

let testOptions: TestOptions = {
    logLevel: LogLevel.DEFAULT,
    pollingLimit: 60,
    serverManagerAddress: "",
    dappAddress: "0x142105FC8dA71191b3a13C738Ba0cF4BC33325e2",
    inputBoxAddress: "0x5a723220579C0DCb8C9253E6b4c62e572E379945",
    erc20PortalAddress: "0x4340ac4FcdFC5eF8d34930C96BBac2Af1301DF40",
    erc20Address: "0xc6e7DF5E7b4f2A278906862b61205850344D4e7d",
    castRpcEndpoint: "http://localhost:8545",
    graphQLServer: "http://localhost:4000/graphql",
    inspectServer: "http://localhost:5005/inspect",
};

const captureStringArg = (argv: string[], argName: string): string => {
    let index = argv.indexOf(argName);
    if (index >= 0) {
        try {
            console.log(argv[index + 1]);
            return argv[index + 1].toLowerCase();
        } catch (error) {
            throw new Error(`Failed to parse arguments. ${error}`);
        }
    }
    return "";
};

const captureNumberArg = (argv: string[], argName: string): number => {
    let index = argv.indexOf(argName);
    if (index >= 0) {
        try {
            let value = Number(argv[index + 1]);
            if (value >= 0) {
                return value;
            }
        } catch (error) {
            throw new Error(`Failed to parse arguments. ${error}`);
        }
    }
    return -1;
};

export const setTestOptions = (argv: string[]): TestOptions => {
    let options = testOptions;

    let serverManagerAddress = captureStringArg(argv, "--serverManagerAddress");
    if (serverManagerAddress) {
        options.serverManagerAddress = serverManagerAddress;
    }

    let limit = captureNumberArg(argv, "--pollingLimit");
    if (limit >= 0) {
        options.pollingLimit = limit;
    }

    let dappAddress = captureStringArg(argv, "--dappAddress");
    if (dappAddress) {
        options.dappAddress = dappAddress;
    }

    let inputBoxAddress = captureStringArg(argv, "--inputBoxAddress");
    if (inputBoxAddress) {
        options.inputBoxAddress = inputBoxAddress;
    }

    let erc20PortalAddress = captureStringArg(argv, "--erc20PortalAddress");
    if (erc20PortalAddress) {
        options.erc20PortalAddress = erc20PortalAddress;
    }

    let erc20Address = captureStringArg(argv, "--erc20Address");
    if (erc20Address) {
        options.erc20Address = erc20Address;
    }

    let castRpcEndpoint = captureStringArg(argv, "--castRpcEndpoint");
    if (castRpcEndpoint) {
        options.castRpcEndpoint = castRpcEndpoint;
    }

    let graphQLServer = captureStringArg(argv, "--graphQLServer");
    if (graphQLServer) {
        options.graphQLServer = graphQLServer;
    }

    let inspectServer = captureStringArg(argv, "--inspectServer");
    if (inspectServer) {
        options.inspectServer = inspectServer;
    }

    if (argv.includes("--verbose")) {
        options.logLevel = LogLevel.VERBOSE;
    }

    testOptions = options;
    return testOptions;
};

export const getTestOptions = (): TestOptions => {
    return testOptions;
};

export const sendRequest = async (
    options: RequestOptions,
    data?: any
): Promise<any> => {
    return new Promise((resolve, reject) => {
        const req = request(options, (res: any) => {
            res.on("data", (d: any) => {
                logger.verbose(`Status code: ${res.statusCode}. Data: ${d}`);
                resolve(d);
            });
        });

        req.on("error", (error: any) => {
            logger.verbose(`Request failed: ${JSON.stringify(error)}`);
            reject(error);
        });

        if (data) {
            req.write(data);
        }
        req.end();
    });
};

export const hex2str = (hex: string) => {
    try {
        return ethers.utils.toUtf8String(hex);
    } catch (e) {
        // cannot decode hex payload as a UTF-8 string
        return hex;
    }
};
