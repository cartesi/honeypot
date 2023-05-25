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

#include <algorithm>
#include <cstring>
#include <execution>
#include <fcntl.h>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <string_view>
#include <sys/ioctl.h>
#include <unistd.h>
#include <vector>

#include <boost/multiprecision/cpp_int.hpp>

#include "honeypot.h"
#include "config.h"

static int rollup_fd;
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
    for (auto b: std::string_view{reinterpret_cast<const char *>(data),
                                  length}) {
        ss << std::hex << std::setfill('0') << std::setw(2)
           << static_cast<unsigned>(b);
    }
    return ss.str();
}

static void cpp_int_to_bytes(bool fit_32_bytes, const boost::multiprecision::uint256_t cpp_int,
                             std::vector<uint8_t> *byte_vector) {
    boost::multiprecision::export_bits(cpp_int,
                                       std::back_inserter(*byte_vector),
                                       8);
    if (fit_32_bytes) {
        // As export_bits generate only as many bytes as necessary to fit
        // dapp_balance's value, we need to increase the vector length to
        // FIELD_SIZE and prepend the value with as many leading zeroes as
        // needed.
        byte_vector->erase(byte_vector->begin(),
                           byte_vector->begin() +
                           (byte_vector->size() -
                            FIELD_SIZE));
    }
}

static void cpp_int_to_bytes(const boost::multiprecision::uint256_t cpp_int,
                             std::vector<uint8_t> *byte_vector) {
    cpp_int_to_bytes(false, cpp_int, byte_vector);
}

static void send_report(std::string message, bool verbose) {
    struct rollup_report report {};
    std::vector<uint8_t> message_bytes(message.begin(),
                                       message.end());
    report.payload = {message_bytes.data(), message_bytes.size()};
    rollup_ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_REPORT, &report);

    if (verbose) {
        std::cout << "[DApp] " << message << std::endl;
    }
}

static void send_report(const struct rollup_advance_state request,
                        const int8_t result,
                        std::string message) {
    std::stringstream ss;
    ss << "0x0" << std::to_string(result) << ": ";

    switch (result) {
    case OP_DEPOSIT_PROCESSED:
        ss << "Deposit processed";
        break;
    case OP_VOUCHER_ISSUED:
        ss << "Voucher issued";
        break;
    case OP_NO_FUNDS:
        ss << "No funds";
        break;
    case OP_INVALID_INPUT:
        ss << "Invalid input";
        break;
    case OP_INVALID_DEPOSIT:
        ss << "Invalid deposit";
        break;
    default:
        ss << "Unsupported result";
    }

    if (message != "") {
        ss << " - " << message;
    }

    ss << " (msg_sender: 0x"
       << hex(request.metadata.msg_sender, CARTESI_ROLLUP_ADDRESS_SIZE)
       << ", payload: 0x"
       << hex(request.payload.data, request.payload.length)
       << ")";

    send_report(ss.str(), true);
}

/*
 *  Expected format for ERC-20 deposits inputs:
 *
 * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                   ERC-20 TRANSFER HEADER                      |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                         DEPOSITOR                             |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |            ZERO-PADDED ERC-20 CONTRACT ADDRESS                |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                           AMOUNT                              |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                           L1-DATA                             |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
static bool process_deposit(rollup_bytes input_payload,
                            boost::multiprecision::uint256_t *amount_deposited) {
    const uint8_t SUCCESSFUL_DEPOSIT = 1;
    size_t pos;

    // Validate payload comes from a successful deposit
    if (SUCCESSFUL_DEPOSIT != *input_payload.data)
    {
        return false;
    }

    // Validate ERC-20 contract address
    pos = 1;
    if (std::memcmp(ERC20_CONTRACT_ADDRESS.data(),
                    input_payload.data + pos,
                    CARTESI_ROLLUP_ADDRESS_SIZE) != 0) {
        return false;
    }

    // Read deposit amount
    pos += 2 * CARTESI_ROLLUP_ADDRESS_SIZE;
    std::vector<uint8_t> amount_bytes;
    std::copy(&input_payload.data[pos],
              &input_payload.data[pos + FIELD_SIZE],
              std::back_inserter(amount_bytes));
    boost::multiprecision::uint256_t amount;
    boost::multiprecision::import_bits(amount,
                                       amount_bytes.begin(),
                                       amount_bytes.end());
    dapp_balance += amount;

    *amount_deposited = amount;
    return true;
}

/*
 * Payload format of a Voucher for ERC-20 withdrawals:
 *
 * 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |FUNC.  |             ZERO-PADDED ACCOUNT ADDRESS               |
 * |SELEC. |                                                       |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |       |                        AMOUNT                         |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |       |
 * +-+-+-+-+
 */
static void issue_voucher() {
    rollup_voucher voucher{};
    std::vector<uint8_t> voucher_payload;

    // Set ERC-20 contract address
    std::copy(
        ERC20_CONTRACT_ADDRESS.begin(),
        ERC20_CONTRACT_ADDRESS.end(),
        voucher.destination);

    // Append transfer function selector
    voucher_payload.insert(
        voucher_payload.end(),
        TRANSFER_FUNCTION_SELECTOR_BYTES.begin(),
        TRANSFER_FUNCTION_SELECTOR_BYTES.end());

    // Add 12-byte long address padding
    voucher_payload.insert(voucher_payload.end(), ADDRESS_PADDING_SIZE, 0);

    // Add Pre-defined withdrawal address
    voucher_payload.insert(
        voucher_payload.end(),
        WITHDRAWAL_ADDRESS.begin(),
        WITHDRAWAL_ADDRESS.end());

    // Export DApp balance to 32-byte vector
    std::vector<uint8_t> dapp_balance_bytes(FIELD_SIZE);
    cpp_int_to_bytes(true,
                     dapp_balance,
                     &dapp_balance_bytes);

    // Add balance
    voucher_payload.insert(
        voucher_payload.end(),
        dapp_balance_bytes.begin(),
        dapp_balance_bytes.end());

    voucher.payload.length = voucher_payload.size();
    voucher.payload.data = voucher_payload.data();

    rollup_ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_VOUCHER, &voucher);

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

    std::stringstream ss;
    uint8_t result = OP_INVALID_INPUT;
    if (msg_sender == ERC20_PORTAL_ADDRESS) {
        boost::multiprecision::uint256_t amount;
        accept = process_deposit(request.payload, &amount);
        if (accept) {
            ss << "ERC-20 amount deposited: " << std::dec << amount << ". "
               << "New pot size = " << dapp_balance;
            result = OP_DEPOSIT_PROCESSED;
        } else {
            result = OP_INVALID_DEPOSIT;
        }
    } else if (msg_sender == WITHDRAWAL_ADDRESS) {
        if (dapp_balance > 0) {
            issue_voucher();
            result = OP_VOUCHER_ISSUED;
        } else {
            result = OP_NO_FUNDS;
            accept = false;
        }
    } else {
        accept = false;
    }

    send_report(request, result, ss.str());
    return accept;
}

static bool handle_inspect(int rollup_fd, rollup_bytes payload_buffer) {
    std::vector<uint8_t> dapp_balance_bytes;
    cpp_int_to_bytes(dapp_balance, &dapp_balance_bytes);

    struct rollup_report report {};
    report.payload = { dapp_balance_bytes.data(), dapp_balance_bytes.size() };
    rollup_ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_REPORT, &report);

    std::cout << "[DApp] Pot balance: 0x" << dapp_balance << std::endl;
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
