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
import { createClient, defaultExchanges } from "@urql/core";
import fetch from "cross-fetch";
import {
    ReportsByInputDocument,
    Report,
    Input,
} from "../../generated-src/graphql";

import { getTestOptions, logger, timer } from "../../util";

// Define PartialReport type only with the desired fields of the full Report
// defined by the GraphQL schema
export type PartialInput = Pick<Input, "index">;
export type PartialReport = Pick<Report, "__typename" | "index" | "payload"> & {
    input: PartialInput;
};
export type PartialReportEdge = { node: PartialReport };

// define a type predicate to filter out reports
const isPartialReportEdge = (
    n: PartialReportEdge | null
): n is PartialReportEdge => n !== null;

const CONFIG = getTestOptions();

/**
 * Query a GraphQL server for reports based on input keys
 * @param input input identification keys
 * @returns List of reports, returned as PartialReport objects
 */
export const getReports = async (
    inputIndex?: number
): Promise<PartialReport[]> => {
    // Create GraphQL client to reader server
    const url: string = CONFIG.graphQLServer;
    const client = createClient({ url, exchanges: defaultExchanges, fetch });

    // Query the GraphQL server for reports according to the input receipt
    logger.verbose(
        `Querying ${url} for reports of input index "${inputIndex}"...`
    );

    let count = 0;
    await timer(10);
    do {
        logger.verbose(`Attempt: ${count}`);
        count++;

        if (inputIndex !== undefined) {
            // list reports querying by input
            const { data, error } = await client
                .query(ReportsByInputDocument, { inputIndex: inputIndex })
                .toPromise();
            if (data?.input?.reports?.edges) {
                return data.input.reports.edges
                    .filter<PartialReportEdge>(isPartialReportEdge)
                    .map((e) => e.node);
            }
        }
        await timer(1);
    } while (count < CONFIG.pollingLimit);
    return [];
};
