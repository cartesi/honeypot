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

#include <algorithm>
#include <cstring>
#include <execution>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#include <fcntl.h>
#include <sys/ioctl.h>
#include <unistd.h>

#include <boost/multiprecision/cpp_int.hpp>

#include "honeypot.h"
#include "config.h"

static int rollup_fd;
static std::array<uint8_t,CARTESI_ROLLUP_ADDRESS_SIZE> rollup_address;
static boost::multiprecision::uint256_t dapp_balance;

static int open_rollup_device() {
    int rollup_fd = open(ROLLUP_DEVICE_NAME, O_RDWR);
    if (rollup_fd < 0) {
        throw std::system_error(errno,
                                std::generic_category(),
                                "unable to open rollup device");
    }
    return rollup_fd;
}

static void rollup_ioctl(int rollup_fd, unsigned long request, void *data) {
    if (ioctl(rollup_fd, request, data) < 0) {
        throw std::system_error(errno,
                                std::generic_category(),
                                "unable to perform operation");
    }
}

static std::string hex(const uint8_t *data, uint64_t length) {
    std::stringstream ss;
    for (auto b: std::string_view{reinterpret_cast<const char *>(data), length}) {
        ss << std::hex << std::setfill('0') << std::setw(2) << static_cast<unsigned>(b);
    }
    return ss.str();
}

static void send_report(rollup_bytes payload) {
    struct rollup_report report {};
    report.payload = payload;
    rollup_ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_REPORT, &report);
}

static void send_text_report(std::string message) {
    std::vector<uint8_t> message_bytes(message.begin(), message.end());
    send_report({message_bytes.data(), message_bytes.size()});
}

/*
 * Expected format for ETH deposits:
 *
 * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                   ETHER TRANSFER HEADER                       |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                         DEPOSITOR                             |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                           AMOUNT                              |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                           L1-DATA                             |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
static bool process_deposit(rollup_bytes input_payload) {
    // Validate input header
    if (std::memcmp(ETHER_TRANSFER_HEADER.data(),
                    input_payload.data,
                    FIELD_SIZE)) {
        std::stringstream ss;
        ss << OP_INVALID_DEPOSIT <<
           " - Invalid header on input 0 " <<
           hex(input_payload.data, input_payload.length);
        send_text_report(ss.str());
        return false;
    }

    size_t pos = 2 * FIELD_SIZE;
    size_t count = FIELD_SIZE;
    std::vector<uint8_t> amount_bytes;

    std::copy(&input_payload.data[pos],
              &input_payload.data[pos + count],
              std::back_inserter(amount_bytes));

    boost::multiprecision::uint256_t amount;
    boost::multiprecision::import_bits(amount,
                                       amount_bytes.begin(),
                                       amount_bytes.end());
    dapp_balance += amount;

    std::stringstream ss;
    ss << OP_DEPOSIT_PROCESSED << " - Amount deposited: ETH " << std::dec
       << amount;

    send_text_report(ss.str());
    return true;
}

/*
 * Payload format of a Voucher for a ETH withdrawal:
 *
 * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+
 * |FUNC.  |
 * |SELEC. |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                  LOCATION OF THE CALLDATA                     |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                   LENGTH OF THE CALLDATA                      |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                 ZERO-PADDED ACCOUNT ADDRESS                   |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                            AMOUNT                             |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *
 * `etherWithdrawal` signature [1]:
 *
 * ```
 * function etherWithdrawal(bytes calldata _data) external returns (bool);
 * ```
 *
 * [1] https://github.com/cartesi-corp/rollups/blob/v0.8.2/onchain/rollups/contracts/interfaces/IEtherPortal.sol#L27
 */
static void issue_voucher() {
    rollup_voucher voucher{};
    std::vector<uint8_t> voucher_payload;

    std::copy(
        rollup_address.begin(),
        rollup_address.end(),
        voucher.address);

    // Transfer function selector
    voucher_payload.insert(
        voucher_payload.end(),
        ETHER_WITHDRAWAL_FUNCTION_SELECTOR_BYTES.begin(),
        ETHER_WITHDRAWAL_FUNCTION_SELECTOR_BYTES.begin() + 4);

    // For enconding of dynamic type `bytes`, check:
    // https://docs.soliditylang.org/en/v0.5.3/abi-spec.html
    voucher_payload.insert(
        voucher_payload.end(),
        CALLDATA_OFFSET_BYTES.begin(),
        CALLDATA_OFFSET_BYTES.end());
    voucher_payload.insert(
        voucher_payload.end(),
        CALLDATA_LENGTH_BYTES.begin(),
        CALLDATA_LENGTH_BYTES.end());

    // 12-byte long address padding
    voucher_payload.insert(voucher_payload.end(), ADDRESS_PADDING_SIZE, 0);

    // Pre-defined withdrawal address
    voucher_payload.insert(
        voucher_payload.end(),
        WITHDRAWAL_ADDRESS.begin(),
        WITHDRAWAL_ADDRESS.end());

    // Export DApp balance to 32-byte vector
    std::vector<uint8_t> dapp_balance_bytes(FIELD_SIZE);
    boost::multiprecision::export_bits(dapp_balance,
                                       std::back_inserter(
                                           dapp_balance_bytes),
                                       8);
    // As export_bits generate only as many bytes as necessary to fit
    // dapp_balance's value, we need to increase the vector length to
    // FIELD_SIZE and prepend the value with as many leading zeroes as
    // needed.
    dapp_balance_bytes.erase(dapp_balance_bytes.begin(),
                             dapp_balance_bytes.begin() +
                             (dapp_balance_bytes.size() -
                              FIELD_SIZE));
    voucher_payload.insert(
        voucher_payload.end(),
        dapp_balance_bytes.begin(),
        dapp_balance_bytes.end());

    voucher.payload.length = voucher_payload.size();
    voucher.payload.data = voucher_payload.data();

    rollup_ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_VOUCHER, &voucher);

    std::stringstream ss;
    ss << OP_VOUCHER_ISSUED << " - Voucher generated for withdrawal of ETH " << std::dec
       << dapp_balance;
    send_text_report(ss.str());

    dapp_balance = 0;
}

static bool handle_advance(int rollup_fd, rollup_bytes payload_buffer) {
    std::array<uint8_t,CARTESI_ROLLUP_ADDRESS_SIZE> msg_sender;
    struct rollup_advance_state request {};
    request.payload = payload_buffer;
    bool accept = true;

    rollup_ioctl(rollup_fd, IOCTL_ROLLUP_READ_ADVANCE_STATE, &request);

    std::copy(request.metadata.msg_sender,
              request.metadata.msg_sender + CARTESI_ROLLUP_ADDRESS_SIZE,
              msg_sender.begin());

    if (request.metadata.epoch_index == 0 && request.metadata.input_index == 0) {
        rollup_address = msg_sender;
        std::cout << "[DApp] Captured rollup address: 0x"
                  << hex(request.metadata.msg_sender,
                         CARTESI_ROLLUP_ADDRESS_SIZE)
                  << std::endl;
        return accept;
    }

    if (msg_sender == rollup_address)
        accept = process_deposit(request.payload);
    else if (msg_sender == WITHDRAWAL_ADDRESS) {
        if (dapp_balance > 0) {
            issue_voucher();
        } else {
            accept = false;
            std::stringstream ss;
            ss << OP_NO_FUNDS
               << " - Withdrawal request refused due to lack of funds";
            send_text_report(ss.str());
        }
    } else {
        accept = false;
        auto data = std::string_view{
            reinterpret_cast<const char *>(request.payload.data),
            request.payload.length
        };
        std::stringstream ss;
        ss << OP_INVALID_INPUT << " - Payload: " << data;
        send_text_report(ss.str());
    }

    std::cout << "[DApp] Input processed" << std::endl;
    return accept;
}

static bool handle_inspect(int rollup_fd, rollup_bytes payload_buffer) {
    std::stringstream ss;
    ss << dapp_balance;
    send_text_report(ss.str());
    return true;
}

int main(int argc, char** argv) try {
    rollup_fd = open_rollup_device();
    struct rollup_finish finish_request {};
    std::vector<uint8_t> payload_buffer;

    finish_request.accept_previous_request = true;
    while (true) {
        rollup_ioctl(rollup_fd, IOCTL_ROLLUP_FINISH, &finish_request);
        auto len = static_cast<uint64_t>(finish_request.next_request_payload_length);
        payload_buffer.resize(len);
        if (finish_request.next_request_type == CARTESI_ROLLUP_ADVANCE_STATE) {
            handle_advance(rollup_fd, {payload_buffer.data(), len});
        } else if (finish_request.next_request_type == CARTESI_ROLLUP_INSPECT_STATE) {
            handle_inspect(rollup_fd, {payload_buffer.data(), len});
        }
    }
    close(rollup_fd);
    return 0;
} catch (std::exception &e) {
    std::cerr << "Caught exception: " << e.what() << '\n';
    return 1;
} catch (...) {
    std::cerr << "Caught unknown exception\n";
    return 1;
}
