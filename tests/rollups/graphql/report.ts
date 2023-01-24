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
import { createClient, defaultExchanges } from "@urql/core";
import fetch from "cross-fetch";
import {
    ReportsDocument,
    ReportsByEpochDocument,
    ReportsByEpochAndInputDocument,
    Report,
    Input,
    ReportDocument,
} from "../../generated-src/graphql";

import { getTestOptions, logger, timer } from "../../util";
import { InputReceipt } from "../../types";

// Define PartialReport type only with the desired fields of the full Report
// defined by the GraphQL schema
export type PartialEpoch = Pick<Input, "index">;
export type PartialInput = Pick<Input, "index"> & { epoch: PartialEpoch };
export type PartialReport = Pick<
    Report,
    "__typename" | "id" | "index" | "payload"
> & {
    input: PartialInput;
};

// define a type predicate to filter out reports
const isPartialReport = (n: PartialReport | null): n is PartialReport =>
    n !== null;

const CONFIG = getTestOptions();

/**
 * Query a GraphQL server for reports based on input keys
 * @param input input identification keys
 * @returns List of reports, returned as PartialReport objects
 */
export const getReports = async (
    inputReceipt: InputReceipt
): Promise<PartialReport[]> => {
    // Create GraphQL client to reader server
    const url: string = CONFIG.graphQLServer;
    const client = createClient({ url, exchanges: defaultExchanges, fetch });

    // Query the GraphQL server for reports according to the input receipt
    logger.verbose(
        `Querying ${url} for reports of ${JSON.stringify(inputReceipt)}...`
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
            // list reports querying by epoch and input
            const { data, error } = await client
                .query(ReportsByEpochAndInputDocument, {
                    epoch_index: inputReceipt.epoch_index,
                    input_index: inputReceipt.input_index,
                })
                .toPromise();
            if (data?.epoch?.input?.reports) {
                return data.epoch.input.reports.nodes.filter<PartialReport>(
                    isPartialReport
                );
            }
        }
    } while (count < CONFIG.pollingLimit);
    return [];
};

//TODO Use pollingLimit
/**
 * Query a GraphQL server looking for a specific report
 * @param id ID of the report
 * @returns The corresponding report, returned as a full Report object
 */
export const getReport = async (id: string): Promise<Report> => {
    // create GraphQL client to reader server
    const url: string = CONFIG.graphQLServer;
    const client = createClient({ url, exchanges: defaultExchanges, fetch });

    // query the GraphQL server for the report
    console.log(`Querying ${url} for report "${id}"...`);

    const { data, error } = await client
        .query(ReportDocument, { id })
        .toPromise();

    if (data?.report) {
        return data.report as Report;
    } else {
        throw new Error(error?.message);
    }
};
