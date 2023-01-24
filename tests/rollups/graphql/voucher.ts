// Copyright 2023 Cartesi Pte. Ltd.

// Licensed under the Apache License, Version 2.0 (the "License"); you may not use
// this file except in compliance with the License. You may obtain a copy of the
// License at http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software distributed
// under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
// CONDITIONS OF ANY KIND, either express or implied. See the License for the
// specific language governing permissions and limitations under the License.
import { createClient, defaultExchanges } from "@urql/core";
import fetch from "cross-fetch";
import {
    VouchersDocument,
    VouchersByEpochDocument,
    VouchersByEpochAndInputDocument,
    Voucher,
    Input,
    VoucherDocument,
} from "../../generated-src/graphql";

import { InputReceipt } from "../../types";
import { getTestOptions, logger, timer } from "../../util";

// Define PartialVoucher type only with the desired fields of the full Voucher
// defined by the GraphQL schema
export type PartialEpoch = Pick<Input, "index">;
export type PartialInput = Pick<Input, "index"> & { epoch: PartialEpoch };
export type PartialVoucher = Pick<
    Voucher,
    "__typename" | "id" | "index" | "destination" | "payload"
> & {
    input: PartialInput;
};

// define a type predicate to filter out vouchers
const isPartialVoucher = (n: PartialVoucher | null): n is PartialVoucher =>
    n !== null;

const CONFIG = getTestOptions();

/**
 * Queries a GraphQL server for vouchers based on input keys
 * @param input input identification keys
 * @returns List of vouchers, returned as PartialVoucher objects
 *
 * TODO We could retrieve the whole vouchers instead of partial ones
 */
export const getVouchers = async (
    inputReceipt: InputReceipt
): Promise<PartialVoucher[]> => {
    // create GraphQL client to reader server
    const url: string = CONFIG.graphQLServer;
    const client = createClient({ url, exchanges: defaultExchanges, fetch });

    // query the GraphQL server for vouchers corresponding to the input keys
    logger.verbose(
        `querying ${url} for vouchers of ${JSON.stringify(inputReceipt)}...`
    );

    let count = 0;
    do {
        await timer(1);
        logger.verbose(`Attempt: ${count}`);
        count++;

        if (
            inputReceipt.epoch_index !== undefined &&
            inputReceipt.input_index !== undefined
        ) {
            // list vouchers querying by epoch and input
            const { data, error } = await client
                .query(VouchersByEpochAndInputDocument, {
                    epoch_index: inputReceipt.epoch_index,
                    input_index: inputReceipt.input_index,
                })
                .toPromise();
            if (data?.epoch?.input?.vouchers) {
                return data.epoch.input.vouchers.nodes.filter<PartialVoucher>(
                    isPartialVoucher
                );
            } else {
                return [];
            }
        } else if (inputReceipt.epoch_index !== undefined) {
            // list vouchers querying only by epoch
            const { data, error } = await client
                .query(VouchersByEpochDocument, {
                    epoch_index: inputReceipt.epoch_index,
                })
                .toPromise();
            if (data?.epoch?.inputs) {
                // builds return vouchers array by concatenating each input's vouchers
                let ret: PartialVoucher[] = [];
                const inputs = data.epoch.inputs.nodes;
                for (let input of inputs) {
                    ret = ret.concat(
                        input.vouchers.nodes.filter<PartialVoucher>(
                            isPartialVoucher
                        )
                    );
                }
                return ret;
            } else {
                return [];
            }
        } else if (inputReceipt.input_index !== undefined) {
            throw new Error(
                "Querying only by input index is not supported. Please define epoch index as well."
            );
        } else {
            // list vouchers using top-level query
            const { data, error } = await client
                .query(VouchersDocument, {})
                .toPromise();
            if (data?.vouchers) {
                return data.vouchers.nodes.filter<PartialVoucher>(
                    isPartialVoucher
                );
            } else {
                return [];
            }
        }
    } while (count < CONFIG.pollingLimit);
    return [];
};

/**
 * Queries a GraphQL server looking for a specific voucher
 * @param id ID of the voucher
 * @returns The corresponding voucher, returned as a full Voucher object
 */
export const getVoucher = async (id: string): Promise<Voucher> => {
    // create GraphQL client to reader server
    const url: string = CONFIG.graphQLServer;
    const client = createClient({ url, exchanges: defaultExchanges, fetch });

    // query the GraphQL server for the voucher
    logger.verbose(`querying ${url} for voucher "${id}"...`);

    const { data, error } = await client
        .query(VoucherDocument, { id })
        .toPromise();

    if (data?.voucher) {
        return data.voucher as Voucher;
    } else {
        throw new Error(error?.message);
    }
};
