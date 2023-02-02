#!/usr/bin/env bash
# Copyright 2023 Cartesi Pte. Ltd.
#
# SPDX-License-Identifier: Apache-2.0
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use
# this file except in compliance with the License. You may obtain a copy of the
# License at http:#www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software distributed
# under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
# CONDITIONS OF ANY KIND, either express or implied. See the License for the
# specific language governing permissions and limitations under the License.
if [ -z "$1" ]; then
    printf "Error: Missing required argument!\n\n"
    printf "\tUsage: $0 hex_string\n\n"
    printf "\tExample: $0 0x70997970C51812dc3A010C7d01b50e0d17dc79C8\n"
    exit 1
fi

hex_string=$1

printf "Converting '${hex_string}'...\n\n"

printf "WITHDRAWAL_ADDRESS = {"
for ((i = 2; i < ${#hex_string}; i+=2)); do
    hex_number="${hex_string:i:2}"
    printf "$((16#${hex_number}))"

    if [ $i -lt $(expr ${#hex_string} - 2) ]; then
        printf ", "
    fi
done
printf "}\n"

printf "Done.\n"
