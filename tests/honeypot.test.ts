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
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import * as ethers from "ethers";

import * as cast from "./cast";

import * as graphql from "./rollups/graphql";

import { inspect, PollingServerManagerClient } from "./rollups/rollups";

import {
    CommandOutput,
    hex2str,
    logger,
    LogLevel,
    setTestOptions,
    getTestOptions,
} from "./util";

const PROJECT_NAME = require("project-name");

const SERVER_MANAGER_PROTO = "./grpc-interfaces/server-manager.proto";

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
logger.logLevel = testConfig.logLevel;

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

    it("Withdraw request from WITHDRAW_ADDRESS results in a voucher", async () => {
        const AMOUNT: ethers.BigNumber = ethers.BigNumber.from(
            "100000000000000000000"
        );

        const initialBobBalance = await cast.getErc20Balance(BOB_ADDRESS);
        let dappBalance: ethers.BigNumber = ethers.BigNumber.from(
            await inspect("any_payload_should_work")
        );
        let expectedDappBalance: ethers.BigNumber = dappBalance.add(AMOUNT);
        logger.verbose("> Balances retrieved");
        logger.verbose("> Bob's   : " + initialBobBalance);
        logger.verbose("> Pot size: " + dappBalance);

        await cast.increaseAllowance(ALICE_ADDRESS, AMOUNT);
        logger.verbose("> Allowance increased");

        let inputIndex: number = await cast.erc20Deposit(ALICE_ADDRESS, AMOUNT);
        logger.verbose("> Input index: " + inputIndex);
        logger.verbose("> Deposit performed");
        logger.verbose("> Amount: " + AMOUNT);

        let reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);
        let reportPayload: string = hex2str(reports[0].payload);
        expect(reportPayload.startsWith(OP.DEPOSIT_PROCESSED));
        logger.verbose("> Report retrieved");

        dappBalance = ethers.BigNumber.from(
            await inspect("any_payload_should_work")
        );
        expect(dappBalance.eq(expectedDappBalance));
        logger.verbose("> Pot size: " + dappBalance);
        logger.verbose("> Expected: " + expectedDappBalance);
        logger.verbose("> DApp balance matches expected value");

        inputIndex = await cast.sendInput(BOB_ADDRESS, "0x00");
        logger.verbose("> Input index: " + inputIndex);

        reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);
        reportPayload = hex2str(reports[0].payload);
        expect(reportPayload.startsWith(OP.VOUCHER_ISSUED));
        logger.verbose("> Voucher issued");

        let vouchers: graphql.PartialVoucher[] = await graphql.getVouchers(
            inputIndex
        );

        expect(vouchers.length).to.eq(1);
        logger.verbose("> Voucher retrieved");
        logger.verbose(vouchers[0]);
    });

    it("Withdraw request from WITHDRAW_ADDRESS is rejected due to lack of funds", async () => {
        let dappBalance = await cast.getErc20Balance(testConfig.dappAddress);
        expect(dappBalance.eq(0));

        let inputIndex: number = await cast.sendInput(BOB_ADDRESS, "0x00");
        const reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);

        const reportPayload: string = hex2str(reports[0].payload);
        expect(reportPayload.startsWith(OP.NO_FUNDS));
    });

    it("Withdraw request from wrong msg_sender is rejected", async () => {
        let inputIndex: number = await cast.sendInput(ALICE_ADDRESS, "0x00");
        logger.verbose("> Input index: " + inputIndex);

        const reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);
        const reportPayload: string = hex2str(reports[0].payload);
        expect(reportPayload.startsWith(OP.INVALID_INPUT));
    });
});
