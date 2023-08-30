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
import { spawnSync } from "child_process";
import * as ethers from "ethers";

import {
    CommandOutput,
    getTestOptions,
    logger,
    spawnAsync,
    TestOptions,
    INPUT_ADDED_EVENT_HASH,
} from "./util";
import { log } from "console";

const CONFIG = getTestOptions();

interface TransactionLog {
    address: string;
    topics: string[];
    data?: string;
    blockHash?: string;
    blockNumber?: string;
    transactionHash?: string;
    transacionIndex?: string;
    logIndex?: string;
    removed?: boolean;
}

interface CastOutput {
    blockHash?: string;
    blockNumber?: number;
    contractAddress?: string;
    cumulativeGasUsed?: number;
    effectiveGasPrice?: number;
    gasUsed?: number;
    logs: TransactionLog[];
    logsBloom?: string;
    root?: string;
    status?: number;
    transactionHash?: string;
    transactionIndex?: number;
    type?: number;
}

const filterInputIndex = (rawReceipt: CastOutput): number => {
    for (let i = 0; i < rawReceipt.logs.length; i++) {
        if (
            rawReceipt.logs[i].address.toLowerCase() ==
                CONFIG.inputBoxAddress.toLowerCase() &&
            rawReceipt.logs[i].topics[0].toLowerCase() ==
                INPUT_ADDED_EVENT_HASH.toLowerCase()
        ) {
            return Number(rawReceipt.logs[i].topics[2]);
        }
    }
    return -1;
};

/*
 * Retrieve balance of a given address in wei.
 */
export const getBalance = async (
    address: string
): Promise<ethers.BigNumber> => {
    const cmd = "cast";
    const args = ["balance", address, "--rpc-url", CONFIG.castRpcEndpoint];

    const io = await spawnAsync(cmd, args, {});

    let balanceStr: string = io.stdout.substring(0, io.stdout.length - 1);
    return ethers.BigNumber.from(balanceStr.replace("\n", ""));
};

/*
 * Retrieve balance of a given address for a given ERC20 contract.
 */
export const getErc20Balance = async (
    address: string
): Promise<ethers.BigNumber> => {
    const cmd = "cast";
    const args = [
        "call",
        CONFIG.erc20Address,
        "balanceOf(address)",
        address,
        "--rpc-url",
        CONFIG.castRpcEndpoint,
    ];
    const io = await spawnAsync(cmd, args, {});

    let balanceStr: string = io.stdout.substring(0, io.stdout.length - 1);
    logger.verbose(`getERC20Balance >> ${balanceStr}`)
    return ethers.BigNumber.from(balanceStr.replace("\n", ""));
};

const castSend = async (
    signerAddress: string,
    privateKey: string,
    functionArgs: string[],
): Promise<CommandOutput> => {
    const cmd = "cast";
    const args = [
        "send",
        // functionArgs are inserted here
        "--rpc-url",
        CONFIG.castRpcEndpoint,
        "--from",
        signerAddress,
        "--private-key",
        privateKey,
        "--json",
    ];

    const offset = 1;
    for (let i = 0; i < functionArgs.length; i++) {
        args.splice(offset + i, 0, functionArgs[i]);
    }

    return await spawnAsync(cmd, args);
};

/*
 * Send a text input from a given signerAddress.
 */
export const sendInput = async (
    signerAddress: string,
    privateKey: string,
    payload: string
): Promise<number> => {
    let hexPayload: string = ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(payload)
    );

    const functionArgs: string[] = [
        CONFIG.inputBoxAddress,
        "addInput(address,bytes)",
        CONFIG.dappAddress,
        hexPayload,
    ];

    const tx = await castSend(signerAddress,privateKey, functionArgs);
    return filterInputIndex(JSON.parse(tx.stdout));
};

/*
 * Approve allowance for ERC-20 tokens
 */
export const increaseAllowance = async (
    signerAddress: string,
    privateKey:string,
    amount: ethers.BigNumber
): Promise<void> => {
    const functionArgs: string[] = [
        CONFIG.erc20Address,
        "increaseAllowance(address,uint256)",
        CONFIG.erc20PortalAddress,
        amount.toString(),
        "",
    ];

    const tx = await castSend(signerAddress,privateKey, functionArgs);
    return;
};

/*
 * Deposit ERC20 tokens
 */
export const erc20Deposit = async (
    signerAddress: string,
    privateKey:string,
    amount: ethers.BigNumber,
    data?: string
): Promise<number> => {
    const functionArgs: string[] = [
        CONFIG.erc20PortalAddress,
        "depositERC20Tokens(address,address,uint256,bytes)",
        CONFIG.erc20Address,
        CONFIG.dappAddress,
        amount.toString(),
        data ?? "",
    ];

    const tx = await castSend(signerAddress,privateKey, functionArgs);
    return filterInputIndex(JSON.parse(tx.stdout));
};

/*
 * Deposit ETH
 */
export const ethDeposit = async (
    signerAddress: string,
    privateKey: string,
    amount: ethers.BigNumber,
    l2Data: string
): Promise<number> => {
    const functionArgs: string[] = [
        CONFIG.dappAddress,
        "etherDeposit(bytes)",
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(l2Data)),
        "--value",
        amount.toString(),
    ];

    const tx = await castSend(signerAddress,privateKey,functionArgs);
    return filterInputIndex(JSON.parse(tx.stdout));
};
