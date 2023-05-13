// Copyright Cartesi Pte. Ltd.

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
    VouchersByInputDocument,
    Voucher,
    Input,
} from "../../generated-src/graphql";

import { getTestOptions, logger, timer } from "../../util";

// Define PartialVoucher type only with the desired fields of the full Voucher defined by the GraphQL schema
export type PartialInput = Pick<Input, "index">;
export type PartialVoucher = Pick<
    Voucher,
    "__typename" | "index" | "destination" | "payload"
> & {
    input: PartialInput;
};
export type PartialVoucherEdge = { node: PartialVoucher };

// Define a type predicate to filter out vouchers
const isPartialVoucherEdge = (
    n: PartialVoucherEdge | null
): n is PartialVoucherEdge => n !== null;

const CONFIG = getTestOptions();

/**
 * Queries a GraphQL server for vouchers based on input keys
 * @param input input identification keys
 * @returns List of vouchers, returned as PartialVoucher objects
 *
 * TODO We could retrieve the whole vouchers instead of partial ones
 */
export const getVouchers = async (
    inputIndex: number
): Promise<PartialVoucher[]> => {
    // create GraphQL client to reader server
    const url: string = CONFIG.graphQLServer;
    const client = createClient({ url, exchanges: defaultExchanges, fetch });

    // query the GraphQL server for vouchers corresponding to the input keys
    logger.verbose(
        `querying ${url} for vouchers of input index ${JSON.stringify(
            inputIndex
        )}...`
    );

    let count = 0;
    await timer(10);
    do {
        logger.verbose(`Attempt: ${count}`);
        count++;

        if (inputIndex !== undefined) {
            // list vouchers querying by input
            const { data, error } = await client
                .query(VouchersByInputDocument, {
                    inputIndex: inputIndex,
                })
                .toPromise();
            if (data?.input?.vouchers?.edges) {
                return data.input.vouchers.edges
                    .filter<PartialVoucherEdge>(isPartialVoucherEdge)
                    .map((e) => e.node);
            } else {
                return [];
            }
        }
        await timer(1);
    } while (count < CONFIG.pollingLimit);
    return [];
};
