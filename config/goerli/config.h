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

#ifndef __CONFIG_H_
#define __CONFIG_H_

// Byte representation of the address of the ERC-20 Portal,
// 0xA53122bA85D9222945855513F0745aFd49b1966A
const std::array<uint8_t,CARTESI_ROLLUP_ADDRESS_SIZE>
ERC20_PORTAL_ADDRESS = {
    165, 49, 34, 186, 133, 217, 34, 41, 69, 133,
    85, 19, 240, 116, 90, 253, 73, 177, 150, 106
};

// Byte representation of SimpleERC20 deployed on Goerli:
// 0x0E1AE9AB7F5feFDFF2587e8e7edB2AFf0c4CDc66
const std::array<uint8_t,CARTESI_ROLLUP_ADDRESS_SIZE>
ERC20_CONTRACT_ADDRESS = {
    14, 26, 233, 171, 127, 95, 239, 223, 242, 88,
    126, 142, 126, 219, 42, 255, 12, 76, 220, 102
};

// Byte representation of the withdrawal address (Bob's):
// 0x5A2636B6553F7B6a0ACBD1b1B78d94Ecc2a65FaB
const std::array<uint8_t,CARTESI_ROLLUP_ADDRESS_SIZE>
WITHDRAWAL_ADDRESS = {
    90, 38, 54, 182, 85, 63, 123, 106, 10, 203,
    209, 177, 183, 141, 148, 236, 194, 166, 95, 171
};
#endif
