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

import { InputReceipt } from "./types";

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

const filterInputReceipt = (rawReceipt: CastOutput): InputReceipt => {
    let receipt: InputReceipt = {};

    for (let i = 0; i < rawReceipt.logs.length; i++) {
        if (
            rawReceipt.logs[i].address.toLowerCase() == CONFIG.dappAddress &&
            rawReceipt.logs[i].topics[0].toLowerCase() == INPUT_ADDED_EVENT_HASH
        ) {
            receipt.epoch_index = Number(rawReceipt.logs[i].topics[1]);
            receipt.input_index = Number(rawReceipt.logs[i].topics[2]);
            return receipt;
        }
    }
    return receipt;
};

/*
 * Retrieve balance of a given address for a given ERC20 contract.
 */
export const getBalance = async (
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
    return ethers.BigNumber.from(balanceStr.replace("\n", ""));
};

/*
 * Send a text input from a given signerAddress
 */
export const sendInput = async (
    signerAddress: string,
    payload: string
): Promise<InputReceipt> => {
    let hexPayload: string = ethers.utils.hexlify(
        ethers.utils.toUtf8Bytes(payload)
    );

    //TODO Generalize cast calls in a function
    const cmd = "cast";
    const args = [
        "send",
        CONFIG.dappAddress,
        "addInput(bytes)",
        hexPayload,
        "--rpc-url",
        CONFIG.castRpcEndpoint,
        "--from",
        signerAddress,
        "--json",
    ];
    const tx = await spawnAsync(cmd, args);

    return filterInputReceipt(JSON.parse(tx.stdout));
};
