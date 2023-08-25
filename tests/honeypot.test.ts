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
const ALICE_PRIVATE_KEY = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk").privateKey;
const BOB_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BOB_PRIVATE_KEY = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk","m/44'/60'/0'/0/1").privateKey;

// Honeypot DApp operation/error codes
enum OP {
    OK = 0x00,
    DEPOSIT_TRANSFER_FAILED = 0x01,
    DEPOSIT_INVALID_CONTRACT = 0x02,
    DEPOSIT_BALANCE_OVERFLOW = 0x03,
    WITHDRAW_NO_FUNDS = 0x04,
    WITHDRAW_VOUCHER_FAILED = 0x05,
    INVALID_ADVANCE_REQUEST = 0xFF
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

        logger.verbose("> Retrieve Balances")
        const initialBobBalance = await cast.getErc20Balance(BOB_ADDRESS);
        let dappBalance: ethers.BigNumber = ethers.BigNumber.from(
            await inspect("")
        );
        let expectedDappBalance: ethers.BigNumber = dappBalance.add(AMOUNT);
        logger.verbose("> Balances retrieved");
        logger.verbose("> Bob's   : " + initialBobBalance);
        logger.verbose("> Pot size: " + dappBalance);

        logger.verbose("> Increase allowance");
        await cast.increaseAllowance(ALICE_ADDRESS,ALICE_PRIVATE_KEY, AMOUNT);
        logger.verbose("> Allowance increased");

        logger.verbose("> Alice deposit")
        let inputIndex: number = await cast.erc20Deposit(ALICE_ADDRESS,ALICE_PRIVATE_KEY, AMOUNT);
        logger.verbose("> Input index: " + inputIndex);
        logger.verbose("> Deposit performed");
        logger.verbose("> Amount: " + AMOUNT);

        logger.verbose(`Check Alice deposit`);
        let reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);
        let reportPayload: string = reports[0].payload;
        logger.verbose(`report payload : ${reportPayload}`);
        expect(Number(reportPayload)).to.eq(OP.OK);
        logger.verbose("> Alice deposit is ok");

        logger.verbose("> Inspect balance");
        dappBalance = ethers.BigNumber.from(await inspect(""));
        logger.verbose("> Pot size: " + dappBalance);
        logger.verbose("> Expected: " + expectedDappBalance);
        expect(dappBalance.eq(expectedDappBalance));
        logger.verbose("> DApp balance matches expected value");

        logger.verbose("> Bob withdrawal")
        inputIndex = await cast.sendInput(BOB_ADDRESS,BOB_PRIVATE_KEY, "");
        logger.verbose("> Input index: " + inputIndex);

        logger.verbose("> Check Bob withdrawal")
        reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);
        reportPayload = reports[0].payload;
        logger.verbose(`report payload : ${reportPayload}`);
        expect(Number(reportPayload)).to.eq(OP.OK);
        logger.verbose("> Voucher was issued");

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

        let inputIndex: number = await cast.sendInput(BOB_ADDRESS,BOB_PRIVATE_KEY, "");
        const reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);

        const reportPayload: string = reports[0].payload;
        expect(Number(reportPayload)).to.eq(OP.WITHDRAW_NO_FUNDS);
    });

    it("Withdraw request with a payload is rejected", async () => {
        
        let inputIndex: number = await cast.sendInput(BOB_ADDRESS,BOB_PRIVATE_KEY, "0x00");
        const reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);

        const reportPayload: string = reports[0].payload;
        expect(Number(reportPayload)).to.eq(OP.INVALID_ADVANCE_REQUEST);
    });

    it("Deposit with a payload is rejected", async () => {
        const AMOUNT: ethers.BigNumber = ethers.BigNumber.from(
            "100000000000000000000"
        );

        logger.verbose("> Increase allowance");
        await cast.increaseAllowance(ALICE_ADDRESS,ALICE_PRIVATE_KEY, AMOUNT);
        logger.verbose("> Allowance increased");

        let inputIndex: number = await cast.erc20Deposit(ALICE_ADDRESS,ALICE_PRIVATE_KEY, AMOUNT,"0x00");
        const reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);

        const reportPayload: string = reports[0].payload;
        expect(Number(reportPayload)).to.eq(OP.INVALID_ADVANCE_REQUEST);
    });

    it("Withdraw request from wrong msg_sender is rejected", async () => {
        let inputIndex: number = await cast.sendInput(ALICE_ADDRESS,ALICE_PRIVATE_KEY, "");
        logger.verbose("> Input index: " + inputIndex);

        const reports = await graphql.getReports(inputIndex);
        expect(reports.length).to.eq(1);
        const reportPayload: string = reports[0].payload;
        expect(Number(reportPayload)).to.eq(OP.INVALID_ADVANCE_REQUEST);
    });
});
