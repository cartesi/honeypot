// (c) Cartesi and individual authors (see https://github.com/cartesi/honeypot/blob/main/AUTHORS)
// SPDX-License-Identifier: Apache-2.0 (see https://github.com/cartesi/honeypot/blob/main/LICENSE)
// Copyright Cartesi Pte. Ltd.

#include <cstdint>
#include <cerrno>    // errno
#include <cstdio>    // fprintf
#include <cstring>   // strerror
#include <array>     // std::array
#include <algorithm> // std::copy

extern "C" {
#include <fcntl.h>     // open
#include <sys/ioctl.h> // ioctl
#include <sys/mman.h>  // mmap/msync
#include <unistd.h>    // close/lseek
#include <linux/cartesi/rollup.h>
}

#include "config.h"

// Path to the Cartesi Rollup device driver inside the Cartesi Machine.
#define ROLLUP_DEVICE_NAME "/dev/rollup"
#define CONFIG_STATE_BLOCK_DEVICE "/dev/mtdblock1"


// Bytecode for solidity 'transfer(address,uint256)' in solidity.
#define TRANSFER_FUNCTION_SELECTOR_BYTES {0xa9, 0x05, 0x9c, 0xbb}

////////////////////////////////////////////////////////////////////////////////
// ERC-20 Address and Big Endian 256 primitives.

using erc20_address = std::array<uint8_t, 20>;
using be256 = std::array<uint8_t, 32>;

// Adds `a` and `b` and store in `res`.
// Returns true when there is no arithmetic overflow, false otherwise.
[[nodiscard]]
static bool be256_checked_add(be256 &res, const be256 &a, const be256 &b) {
    uint16_t carry = 0;
    for (uint32_t i = 0; i < static_cast<uint32_t>(res.size()); ++i) {
        const uint32_t j = static_cast<uint32_t>(res.size()) - i - 1;
        const uint16_t aj = static_cast<uint16_t>(a[j]);
        const uint16_t bj = static_cast<uint16_t>(b[j]);
        const uint16_t tmp = static_cast<uint16_t>(carry + aj + bj);
        carry = tmp >> 8;
        res[j] = static_cast<uint8_t>(tmp & 0xff);
    }
    return carry == 0;
}

////////////////////////////////////////////////////////////////////////////////
// Rollup utilities.

// Status code sent in as reports for well formed advance requests.
enum advance_status : uint8_t {
    ADVANCE_REQUEST_STATUS_SUCCESS = 0x00,
    ADVANCE_REQUEST_STATUS_INVALID = 0xFF
};

static_assert(sizeof(erc20_address) == CARTESI_ROLLUP_ADDRESS_SIZE);

// POD for advance reports.
struct advance_report {
    advance_status status;
} __attribute__((packed));

struct rollup_advance_input_metadata {
    erc20_address sender;
    uint64_t block_number;
    uint64_t timestamp;
    uint64_t epoch_index;
    uint64_t input_index;
} __attribute__((packed));

// Throw an exception message into rollup device.
[[maybe_unused]]
static bool rollup_throw_exception_message(int rollup_fd, const char *message) {
    rollup_exception exception{};
    exception.payload = {const_cast<uint8_t *>(reinterpret_cast<const uint8_t *>(message)), strlen(message)};
    if (ioctl(rollup_fd, IOCTL_ROLLUP_THROW_EXCEPTION, &exception) < 0) {
        (void) fprintf(stderr, "[dapp] unable to throw rollup exception: %s\n", strerror(errno));
        return false;
    }
    return true;
}

// Write a report POD into rollup device.
template <typename T> [[nodiscard]]
static bool rollup_write_report(int rollup_fd, const T &payload) {
    rollup_report report{};
    report.payload = {const_cast<uint8_t *>(reinterpret_cast<const uint8_t *>(&payload)), sizeof(payload)};
    if (ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_REPORT, &report) < 0) {
        (void) fprintf(stderr, "[dapp] unable to write rollup report: %s\n", strerror(errno));
        return false;
    }
    return true;
}

// Write a voucher POD into rollup device.
template <typename T> [[nodiscard]]
static bool rollup_write_voucher(int rollup_fd, const erc20_address &destination, const T &payload) {
    rollup_voucher voucher{};
    std::copy(destination.begin(), destination.end(), voucher.destination);
    voucher.payload = {const_cast<uint8_t *>(reinterpret_cast<const uint8_t *>(&payload)), sizeof(payload)};
    if (ioctl(rollup_fd, IOCTL_ROLLUP_WRITE_VOUCHER, &voucher) < 0) {
        (void) fprintf(stderr, "[dapp] unable to write rollup voucher: %s\n", strerror(errno));
        return false;
    }
    return true;
}

// Finish last rollup request, wait for next rollup request and process it.
// For every new request, reads an input POD and call backs its respective advance or inspect state handler.
template <typename STATE, typename ADVANCE_INPUT, typename INSPECT_QUERY, typename ADVANCE_STATE, typename INSPECT_STATE> [[nodiscard]]
static bool rollup_process_next_request(int rollup_fd, STATE *state, bool accept_previous_request, ADVANCE_STATE advance_cb, INSPECT_STATE inspect_cb) {
    // Finish previous request and wait for the next request.
    rollup_finish finish_request{};
    finish_request.accept_previous_request = accept_previous_request;
    if (ioctl(rollup_fd, IOCTL_ROLLUP_FINISH, &finish_request) < 0) {
        (void) fprintf(stderr, "[dapp] unable to perform IOCTL_ROLLUP_FINISH: %s\n", strerror(errno));
        return false;
    }
    const uint64_t payload_length = static_cast<uint64_t>(finish_request.next_request_payload_length);
    if (finish_request.next_request_type == CARTESI_ROLLUP_ADVANCE_STATE) { // Advance state.
        // Check if input payload length is supported.
        if (payload_length > sizeof(ADVANCE_INPUT)) {
            (void) fprintf(stderr, "[dapp] advance request payload length is too large\n");
            (void) rollup_write_report(rollup_fd, advance_report{ADVANCE_REQUEST_STATUS_INVALID});
            return false;
        }
        // Read the input.
        ADVANCE_INPUT input_data{};
        rollup_advance_state request{};
        request.payload = {reinterpret_cast<uint8_t *>(&input_data), sizeof(input_data)};
        if (ioctl(rollup_fd, IOCTL_ROLLUP_READ_ADVANCE_STATE, &request) < 0) {
            (void) fprintf(stderr, "[dapp] unable to perform IOCTL_ROLLUP_READ_ADVANCE_STATE: %s\n", strerror(errno));
            return false;
        }
        rollup_advance_input_metadata input_metadata{{},
            request.metadata.block_number,
            request.metadata.timestamp,
            request.metadata.epoch_index,
            request.metadata.input_index};
        std::copy(std::begin(request.metadata.msg_sender), std::end(request.metadata.msg_sender), input_metadata.sender.begin());
        // Call advance state handler.
        return advance_cb(rollup_fd, state, input_metadata, input_data, payload_length);
    } else if (finish_request.next_request_type == CARTESI_ROLLUP_INSPECT_STATE) { // Inspect state.
        // Check if query payload length is supported.
        if (payload_length > sizeof(INSPECT_QUERY)) {
            (void) fprintf(stderr, "[dapp] inspect request payload length is too large\n");
            return false;
        }
        // Read the query.
        INSPECT_QUERY query_data{};
        rollup_inspect_state request{};
        request.payload = {reinterpret_cast<uint8_t *>(&query_data), sizeof(query_data)};
        if (ioctl(rollup_fd, IOCTL_ROLLUP_READ_INSPECT_STATE, &request) < 0) {
            (void) fprintf(stderr, "[dapp] unable to perform IOCTL_ROLLUP_READ_INSPECT_STATE: %s\n", strerror(errno));
            return false;
        }
        // Call inspect state handler.
        return inspect_cb(rollup_fd, state, query_data, payload_length);
    } else {
        (void) fprintf(stderr, "[dapp] invalid request type\n");
        return false;
    }
}

// Open rollup device and return its file descriptor.
[[nodiscard]]
static int rollup_open() {
    // Open rollup device.
    const int rollup_fd = open(ROLLUP_DEVICE_NAME, O_RDWR);
    if (rollup_fd < 0) {
        // This operation may fail only for machines where the rollup device is not configured correctly.
        (void) fprintf(stderr, "[dapp] unable to open rollup device: %s\n", strerror(errno));
        return -1;
    }
    return rollup_fd;
}

// Process rollup requests forever.
template <typename STATE, typename ADVANCE_INPUT, typename INSPECT_QUERY, typename ADVANCE_STATE, typename INSPECT_STATE> [[noreturn]]
static bool rollup_request_loop(int rollup_fd, STATE *state, ADVANCE_STATE advance_cb, INSPECT_STATE inspect_cb) {
    // Rollup device requires that we initialize the first previous request as accepted.
    bool accept_previous_request = true;
    // Request loop, should loop forever.
    while (true) {
        accept_previous_request = rollup_process_next_request<STATE, ADVANCE_INPUT, INSPECT_QUERY>(rollup_fd, state, accept_previous_request, advance_cb, inspect_cb);
    }
    // Unreachable code.
}

////////////////////////////////////////////////////////////////////////////////
// DApp state utilities.

// Load dapp state from disk.
template <typename STATE> [[nodiscard]]
static STATE *rollup_load_state_from_disk(const char *block_device) {
    // Open the dapp state block device.
    // Note that we open but never close it, we intentionally let the OS do this automatically on exit.
    const int state_fd = open(block_device, O_RDWR);
    if (state_fd < 0) {
        (void) fprintf(stderr, "[dapp] unable to open state block device: %s\n", strerror(errno));
        return nullptr;
    }
    // Check if the block device size is big enough.
    const off_t size = lseek(state_fd, 0, SEEK_END);
    if (size < 0) {
        (void) fprintf(stderr, "[dapp] unable to seek state block device: %s\n", strerror(errno));
        return nullptr;
    }
    if (static_cast<uint64_t>(size) < sizeof(STATE)) {
        (void) fprintf(stderr, "[dapp] state block device size is too small\n");
        return nullptr;
    }
    // Map the state block device to memory.
    // Note that we call mmap() but never call munmap(), we intentionally let the OS automatically do this on exit.
    void *mem = reinterpret_cast<STATE *>(mmap(nullptr, sizeof(STATE), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE, state_fd, 0));
    if (mem == MAP_FAILED) {
        (void) fprintf(stderr, "[dapp] unable to map state block device to memory: %s\n", strerror(errno));
        return nullptr;
    }
    // After the mmap() call, the file descriptor can be closed immediately without invalidating the mapping.
    if (close(state_fd) < 0) {
        (void) fprintf(stderr, "[dapp] unable to close state block device: %s\n", strerror(errno));
        return nullptr;
    }
    return reinterpret_cast<STATE *>(mem);
}

// Flush dapp state to disk.
template <typename STATE> [[maybe_unused]]
static bool rollup_flush_state_to_disk(STATE *state) {
    // Flushes state changes made into memory using mmap(2) back to the filesystem.
    if (msync(state, sizeof(STATE), MS_SYNC) < 0) {
        (void) fprintf(stderr, "[dapp] unable to flush state from memory to disk: %s\n", strerror(errno));
        return false;
    }
    return true;
}

////////////////////////////////////////////////////////////////////////////////
// ERC-20 encoding utilities.

enum erc20_deposit_status : uint8_t {
    ERC20_DEPOSIT_FAILED = 0,
    ERC20_DEPOSIT_SUCCESSFUL = 1,
};

// Payload encoding for ERC-20 deposits.
struct erc20_deposit_payload {
    uint8_t status;
    erc20_address contract_address;
    erc20_address sender_address;
    be256 amount;
} __attribute__((packed));

// Payload encoding for ERC-20 transfers.
struct erc20_transfer_payload {
    std::array<uint8_t, 16> bytecode;
    erc20_address destination;
    be256 amount;
} __attribute__((packed));

// Encodes a ERC-20 transfer of amount to destination address.
static erc20_transfer_payload encode_erc20_transfer(erc20_address destination, be256 amount) {
    erc20_transfer_payload payload{};
    
    payload.bytecode = TRANSFER_FUNCTION_SELECTOR_BYTES;
    // The last 12 bytes in bytecode should be zeros.
    payload.destination = destination;
    payload.amount = amount;
    return payload;
}

////////////////////////////////////////////////////////////////////////////////
// Honeypot application.

static constexpr erc20_address ERC20_PORTAL_ADDRESS     = CONFIG_ERC20_PORTAL_ADDRESS;
static constexpr erc20_address ERC20_WITHDRAWAL_ADDRESS = CONFIG_ERC20_WITHDRAWAL_ADDRESS;
static constexpr erc20_address ERC20_CONTRACT_ADDRESS   = CONFIG_ERC20_CONTRACT_ADDRESS;
static constexpr const char *STATE_BLOCK_DEVICE         = CONFIG_STATE_BLOCK_DEVICE;

// Status code sent in as reports for well formed advance requests.
enum honeypot_advance_status : uint8_t {
    HONEYPOT_STATUS_DEPOSIT_TRANSFER_FAILED = 1,
    HONEYPOT_STATUS_DEPOSIT_INVALID_CONTRACT,
    HONEYPOT_STATUS_DEPOSIT_BALANCE_OVERFLOW,
    HONEYPOT_STATUS_WITHDRAW_NO_FUNDS,
    HONEYPOT_STATUS_WITHDRAW_VOUCHER_FAILED
};

// POD for advance inputs.
struct honeypot_advance_input {
    erc20_deposit_payload deposit;
} __attribute__((packed));

// POD for inspect queries.
struct honeypot_inspect_query {
    // No data needed for inspect requests.
} __attribute__((packed));

// POD for advance reports.
struct honeypot_advance_report {
    honeypot_advance_status status;
} __attribute__((packed));

// POD for inspect reports.
struct honeypot_inspect_report {
    be256 balance;
} __attribute__((packed));

// POD for dapp state.
struct honeypot_dapp_state {
    be256 balance;
} __attribute__((packed));

// Process a ERC-20 deposit request.
static bool honeypot_deposit(int rollup_fd, honeypot_dapp_state *dapp_state, const erc20_deposit_payload &deposit) {
    // Consider only successful ERC-20 deposits.
    if (deposit.status != ERC20_DEPOSIT_SUCCESSFUL) {
        (void) fprintf(stderr, "[dapp] deposit erc20 transfer failed\n");
        (void) rollup_write_report(rollup_fd, honeypot_advance_report{HONEYPOT_STATUS_DEPOSIT_TRANSFER_FAILED});
        return false;
    }
    // Check token contract address.
    if (deposit.contract_address != ERC20_CONTRACT_ADDRESS) {
        (void) fprintf(stderr, "[dapp] invalid deposit contract address\n");
        (void) rollup_write_report(rollup_fd, honeypot_advance_report{HONEYPOT_STATUS_DEPOSIT_INVALID_CONTRACT});
        return false;
    }
    // Add deposit amount to balance.
    if (!be256_checked_add(dapp_state->balance, dapp_state->balance, deposit.amount)) {
        (void) fprintf(stderr, "[dapp] deposit balance overflow\n");
        (void) rollup_write_report(rollup_fd, honeypot_advance_report{HONEYPOT_STATUS_DEPOSIT_BALANCE_OVERFLOW});
        return false;
    }
    // Flush dapp state to disk, so we can inspect its state from outside.
    (void) rollup_flush_state_to_disk(dapp_state);
    // Report that operation succeed.
    (void) fprintf(stderr, "[dapp] successful deposit\n");
    (void) rollup_write_report(rollup_fd, advance_report{ADVANCE_REQUEST_STATUS_SUCCESS});
    return true;
}

// Process a ERC-20 withdraw request.
static bool honeypot_withdraw(int rollup_fd, honeypot_dapp_state *dapp_state) {
    // Report an error if the balance is empty.
    if (dapp_state->balance == be256{}) {
        (void) fprintf(stderr, "[dapp] no funds to withdraw\n");
        (void) rollup_write_report(rollup_fd, honeypot_advance_report{HONEYPOT_STATUS_WITHDRAW_NO_FUNDS});
        return false;
    }
    // Issue a voucher with the entire balance.
    erc20_transfer_payload transfer_payload = encode_erc20_transfer(ERC20_WITHDRAWAL_ADDRESS, dapp_state->balance);
    if (!rollup_write_voucher(rollup_fd, ERC20_CONTRACT_ADDRESS, transfer_payload)) {
        (void) fprintf(stderr, "[dapp] unable to issue withdraw voucher\n");
        (void) rollup_write_report(rollup_fd, honeypot_advance_report{HONEYPOT_STATUS_WITHDRAW_VOUCHER_FAILED});
        return false;
    }
    // Set balance to 0.
    dapp_state->balance = be256{};
    // Flush dapp state to disk, so we can inspect its state from outside.
    (void) rollup_flush_state_to_disk(dapp_state);
    // Report that operation succeed.
    (void) fprintf(stderr, "[dapp] successful withdrawal\n");
    (void) rollup_write_report(rollup_fd, advance_report{ADVANCE_REQUEST_STATUS_SUCCESS});
    return true;
}

// Process a inspect balance request.
static bool honeypot_inspect_balance(int rollup_fd, honeypot_dapp_state *dapp_state) {
    (void) fprintf(stderr, "[dapp] inspect balance request\n");
    return rollup_write_report(rollup_fd, honeypot_inspect_report{dapp_state->balance});
}

// Process advance state requests.
static bool honeypot_advance_state(int rollup_fd, honeypot_dapp_state *dapp_state, const rollup_advance_input_metadata &input_metadata, const honeypot_advance_input &input, uint64_t input_payload_length) {
    if (input_metadata.sender == ERC20_PORTAL_ADDRESS && input_payload_length == sizeof(erc20_deposit_payload)) { // Deposit
        return honeypot_deposit(rollup_fd, dapp_state, input.deposit);
    } else if (input_metadata.sender == ERC20_WITHDRAWAL_ADDRESS && input_payload_length == 0) { // Withdraw
        return honeypot_withdraw(rollup_fd, dapp_state);
    } else { // Invalid request
        (void) fprintf(stderr, "[dapp] invalid advance state request\n");
        (void) rollup_write_report(rollup_fd, advance_report{ADVANCE_REQUEST_STATUS_INVALID});
        return false;
    }
}

// Process inspect state requests.
static bool honeypot_inspect_state(int rollup_fd, honeypot_dapp_state *dapp_state, const honeypot_inspect_query &query, uint64_t query_payload_length) {
    (void) query;
    if (query_payload_length == 0) { // Inspect balance.
        return honeypot_inspect_balance(rollup_fd, dapp_state);
    } else { // Invalid request.
        (void) fprintf(stderr, "[dapp] invalid inspect state request\n");
        return false;
    }
}

// Application main.
int main() {
    // Open rollup device.
    // Note that we open but never close it, we intentionally let the OS do this automatically on exit.
    const int rollup_fd = rollup_open();
    if (rollup_fd < 0) {
        return -1;
    }
    // Load dapp state from disk.
    honeypot_dapp_state *dapp_state = rollup_load_state_from_disk<honeypot_dapp_state>(STATE_BLOCK_DEVICE);
    if (!dapp_state) {
        (void) rollup_throw_exception_message(rollup_fd, "unable to load dapp state");
        return -1;
    }
    // Process requests forever.
    rollup_request_loop<honeypot_dapp_state, honeypot_advance_input, honeypot_inspect_query>(rollup_fd, dapp_state, honeypot_advance_state, honeypot_inspect_state);
    // Unreachable code, return is intentionally omitted.
}

