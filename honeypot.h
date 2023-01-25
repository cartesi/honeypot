// Copyright 2023 Cartesi Pte. Ltd.
//
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License"); you may not use
// this file except in compliance with the License. You may obtain a copy of the
// License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed
// under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
// CONDITIONS OF ANY KIND, either express or implied. See the License for the
// specific language governing permissions and limitations under the License.

#ifndef __HONEYPOT_H_
#define __HONEYPOT_H_
extern "C" {
#include <linux/cartesi/rollup.h>
}

// Path to the Cartesi Rollup device driver inside the Cartesi Machine.
#define ROLLUP_DEVICE_NAME "/dev/rollup"

#define OP_DEPOSIT_PROCESSED "0x00"
#define OP_VOUCHER_ISSUED "0x01"
#define OP_NO_FUNDS "0x02"
#define OP_INVALID_INPUT "0x03"
#define OP_INVALID_DEPOSIT "0x04"

#define FIELD_SIZE 32
#define ADDRESS_PADDING_SIZE 12

// Keccak256-encoded "Ether_Transfer". Used to validate ETH deposits.
// Same as `print(list(Web3.keccak(b"Ether_Transfer")))` in Python.
const std::array<uint8_t,32>
ETHER_TRANSFER_HEADER = {
    242, 88, 224, 252, 57, 211, 90, 189, 125, 131,
    147, 220, 254, 126, 28, 248, 199, 69, 221, 202,
    56, 174, 65, 212, 81, 208, 197, 90, 197, 242,
    196, 206
};

// Keccak256-encoded "etherWithdrawal(bytes)". Used when encoding vouchers.
// Same as `print(list(Web3.keccak(b"etherWithdrawal(bytes)")))` in Python.
const std::array<uint8_t,32>
ETHER_WITHDRAWAL_FUNCTION_SELECTOR_BYTES = {
    116, 149, 107, 148, 16, 146, 150, 104, 139, 32,
    254, 213, 98, 218, 144, 217, 78, 13, 129, 190,
    52, 149, 26, 248, 116, 181, 19, 11, 79, 133,
    189, 187
};

// Offset to start of voucher calldata bytes
const std::array<uint8_t,32>
CALLDATA_OFFSET_BYTES = {
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 32
};

// Length of voucher calldata bytes
const std::array<uint8_t,32>
CALLDATA_LENGTH_BYTES = {
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 64
};

// Account address (Bob's) which is allowed to withdraw the DApp assests
// TODO Make the withdrawal address configurable in build time
const std::array<uint8_t,CARTESI_ROLLUP_ADDRESS_SIZE>
WITHDRAWAL_ADDRESS = {
    112, 153, 121, 112, 197, 24, 18, 220, 58, 1,
    12, 125, 1, 181, 14, 13, 23, 220, 121, 200
};
#endif
