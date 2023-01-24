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
import { ChildProcess, spawn, SpawnOptions } from "child_process";
import { request, RequestOptions } from "http";

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

// TODO Come up with a better name for this function as child_process.spawn
// is asynchronous itself.
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
}

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

export const parseArgs = (argv: string[]): TestOptions => {
    let options: TestOptions = {
        logLevel: LogLevel.DEFAULT,
        pollingLimit: 60,
        serverManagerAddress: "",
    };

    let serverManagerAddress = captureStringArg(argv, "--serverManagerAddress");
    if (serverManagerAddress) {
        options.serverManagerAddress = serverManagerAddress;
    }

    let limit = captureNumberArg(argv, "--pollingLimit");
    if (limit >= 0) {
        options.pollingLimit = limit;
    }

    if (argv.includes("--verbose")) {
        options.logLevel = LogLevel.VERBOSE;
    }

    return options;
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
