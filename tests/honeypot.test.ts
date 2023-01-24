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

import { PollingServerManagerClient } from "./rollups/rollups";

import { CommandOutput, logger, LogLevel, parseArgs } from "./util";

const PROJECT_NAME = require("project-name");

// TODO Move SERVER_MANAGER_PROTO to rollups/rollups.ts
const SERVER_MANAGER_PROTO = "./grpc-interfaces/server-manager.proto";

let serverManager: PollingServerManagerClient;

const { logLevel, pollingLimit, serverManagerAddress } = parseArgs(
    process.argv
);
logger.logLevel = logLevel;

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Integration Tests for " + PROJECT_NAME(), () => {
    before(async function () {
        serverManager = new PollingServerManagerClient(
            serverManagerAddress,
            SERVER_MANAGER_PROTO
        );
        logger.log("    Waiting for server manager...");
        expect(
            await serverManager.isReady(pollingLimit),
            "Failed to connect to Server Manager"
        ).to.be.true;
        logger.log("    Server manager ready!");
    });
});
