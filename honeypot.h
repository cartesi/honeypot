// Copyright Cartesi Pte. Ltd.
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

#define OP_DEPOSIT_PROCESSED 0
#define OP_VOUCHER_ISSUED 1
#define OP_NO_FUNDS 2
#define OP_INVALID_INPUT 3
#define OP_INVALID_DEPOSIT 4

#define FIELD_SIZE 32
#define ADDRESS_PADDING_SIZE 12

// Keccak256-encoded string "ERC20_Transfer". Used to validate ERC-20 deposits.
const std::array<uint8_t,32> ERC20_TRANSFER_HEADER = {
    89, 218, 42, 152, 78, 22, 90, 228, 72, 124,
    153, 229, 209, 220, 167, 224, 76, 138, 153, 48,
    27, 230, 188, 9, 41, 50, 203, 93, 127, 3,
    67, 120
};

// First 4 bytes of the Keccak256-encoded result of "transfer(address,uint256)".
// Used when encoding vouchers.
const std::array<uint8_t,4> TRANSFER_FUNCTION_SELECTOR_BYTES = {
    169, 5, 156, 187
};
#endif
