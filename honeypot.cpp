// Copyright Cartesi and individual authors (see AUTHORS)
// SPDX-License-Identifier: Apache-2.0 (see LICENSE)

#include <cstdint>

#include <cerrno>  // errno
#include <cstdio>  // std::fprintf/stderr
#include <cstring> // std::strerror

#include <algorithm> // std::equal/std::copy_n
#include <array>     // std::array
#include <tuple>     // std::ignore

extern "C" {
#include <fcntl.h>    // open
#include <sys/mman.h> // mmap/msync
#include <unistd.h>   // close/lseek

#include <libcmt/abi.h>
#include <libcmt/io.h>
#include <libcmt/rollup.h>
}

#include <honeypot-config.hpp>
#define STATE_BLOCK_DEVICE "/dev/pmem1"

namespace {

////////////////////////////////////////////////////////////////////////////////
// ERC-20 address type.

using erc20_address = cmt_abi_address_t;

// Compare two ERC-20 addresses.
bool operator==(const erc20_address &a, const erc20_address &b) {
    return std::equal(std::begin(a.data), std::end(a.data), std::begin(b.data));
}

////////////////////////////////////////////////////////////////////////////////
// Big Endian 256 type.

using be256 = std::array<uint8_t, 32>;

// Adds `a` and `b` and store in `res`.
// Returns true when there is no arithmetic overflow, false otherwise.
[[nodiscard]]
bool be256_checked_add(be256 &res, const be256 &a, const be256 &b) {
    uint16_t carry = 0;
    for (size_t i = 0; i < res.size(); ++i) {
        const size_t j = res.size() - i - 1;
        const uint16_t aj = a[j];
        const uint16_t bj = b[j];
        const uint16_t tmp = carry + aj + bj;
        res[j] = static_cast<uint8_t>(tmp);
        carry = tmp >> 8U;
    }
    return carry == 0;
}

////////////////////////////////////////////////////////////////////////////////
// Rollup utilities.

template <typename T>
[[nodiscard]]
constexpr cmt_abi_bytes_t payload_to_bytes(const T &payload) {
    cmt_abi_bytes_t payload_bytes = {
        .length = sizeof(T),
        .data = const_cast<T *>(&payload) // NOLINT(cppcoreguidelines-pro-type-const-cast)
    };
    return payload_bytes;
}

// Emit a report POD into rollup device.
template <typename T>
[[nodiscard]]
bool rollup_emit_report(cmt_rollup_t *rollup, const T &payload) {
    const cmt_abi_bytes_t payload_bytes = payload_to_bytes(payload);
    const int err = cmt_rollup_emit_report(rollup, &payload_bytes);
    if (err < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to emit report: %s\n", std::strerror(-err));
        return false;
    }
    return true;
}

// Emit a voucher POD into rollup device.
template <typename T>
[[nodiscard]]
bool rollup_emit_voucher(cmt_rollup_t *rollup, const erc20_address &address, const T &payload) {
    const cmt_abi_bytes_t payload_bytes = payload_to_bytes(payload);
    const cmt_abi_u256_t wei{}; // Transfer 0 Wei
    const int err = cmt_rollup_emit_voucher(rollup, &address, &wei, &payload_bytes, nullptr);
    if (err < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to emit voucher: %s\n", std::strerror(-err));
        return false;
    }
    return true;
}

// Finish last rollup request, wait for next rollup request and process it.
// For every new request, reads an input POD and call backs its respective advance or inspect state handler.
template <typename STATE, typename ADVANCE_STATE, typename INSPECT_STATE>
[[nodiscard]]
bool rollup_process_next_request(cmt_rollup_t *rollup, STATE *state, ADVANCE_STATE advance_state,
    INSPECT_STATE inspect_state, bool accept_previous_request) {
    // Finish previous request and wait for the next request.
    cmt_rollup_finish_t finish{.accept_previous_request = accept_previous_request};
    const int err = cmt_rollup_finish(rollup, &finish);
    if (err < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to perform rollup finish: %s\n", std::strerror(-err));
        return false;
    }
    // Handle request
    switch (finish.next_request_type) {
        case HTIF_YIELD_REASON_ADVANCE: { // Advance state.
            return advance_state(rollup, state);
        }
        case HTIF_YIELD_REASON_INSPECT: { // Inspect state.
            // Call inspect state handler.
            return inspect_state(rollup, state);
        }
        default: { // Invalid request.
            std::ignore = std::fprintf(stderr, "[dapp] invalid request type\n");
            return false;
        }
    }
}

////////////////////////////////////////////////////////////////////////////////
// ERC-20 encoding utilities.

// Bytecode for solidity 'transfer(address,uint256)' in solidity.
#define TRANSFER_FUNCTION_SELECTOR_BYTES                                                                               \
    {0xa9, 0x05, 0x9c, 0xbb, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}

// Payload encoding for ERC-20 deposits.
struct [[gnu::packed]] erc20_deposit {
    erc20_address token_address;
    erc20_address sender_address;
    be256 amount;
};

// Payload encoding for ERC-20 transfers.
struct [[gnu::packed]] erc20_transfer {
    std::array<uint8_t, 16> bytecode;
    erc20_address destination;
    be256 amount;
};

// Encodes a ERC-20 transfer of amount to destination address.
erc20_transfer encode_erc20_transfer(erc20_address destination, be256 amount) {
    erc20_transfer payload{
        .bytecode = TRANSFER_FUNCTION_SELECTOR_BYTES,
        .destination = destination,
        .amount = amount,
    };
    return payload;
}

////////////////////////////////////////////////////////////////////////////////
// DApp state utilities.

// Load dapp state from disk.
template <typename STATE>
[[nodiscard]]
STATE *dapp_load_state(const char *block_device) {
    // Open the dapp state block device.
    const int state_fd = open(block_device, O_RDWR);
    if (state_fd < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to open state block device: %s\n", std::strerror(errno));
        return nullptr;
    }
    // Check if the block device size is big enough.
    const auto size = lseek(state_fd, 0, SEEK_END);
    if (size < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to seek state block device: %s\n", std::strerror(errno));
        std::ignore = close(state_fd);
        return nullptr;
    }
    if (static_cast<size_t>(size) < sizeof(STATE)) {
        std::ignore = std::fprintf(stderr, "[dapp] state block device size is too small\n");
        std::ignore = close(state_fd);
        return nullptr;
    }
    // Map the state block device to memory.
    // Note that we call mmap() but never call munmap(), we intentionally let the OS automatically do this on exit.
    void *mem = mmap(nullptr, sizeof(STATE), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_POPULATE, state_fd, 0);
    if (mem == MAP_FAILED) {
        std::ignore =
            std::fprintf(stderr, "[dapp] unable to map state block device to memory: %s\n", std::strerror(errno));
        std::ignore = close(state_fd);
        return nullptr;
    }
    // After the mmap() call, the file descriptor can be closed immediately without invalidating the mapping.
    if (close(state_fd) < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to close state block device: %s\n", std::strerror(errno));
        return nullptr;
    }
    return reinterpret_cast<STATE *>(mem); // NOLINT(cppcoreguidelines-pro-type-reinterpret-cast)
}

// Flush dapp state to disk.
template <typename STATE>
void dapp_flush_state(STATE *state) {
    // Flushes state changes made into memory using mmap(2) back to the filesystem.
    if (msync(state, sizeof(STATE), MS_SYNC) < 0) {
        // Cannot recover from failure here, but report the error if any.
        std::ignore =
            std::fprintf(stderr, "[dapp] unable to flush state from memory to disk: %s\n", std::strerror(errno));
    }
}

////////////////////////////////////////////////////////////////////////////////
// Honeypot application.

constexpr erc20_address ERC20_PORTAL_ADDRESS = {CONFIG_ERC20_PORTAL_ADDRESS};
constexpr erc20_address ERC20_WITHDRAWAL_ADDRESS = {CONFIG_ERC20_WITHDRAWAL_ADDRESS};
constexpr erc20_address ERC20_TOKEN_ADDRESS = {CONFIG_ERC20_TOKEN_ADDRESS};

// Status code sent in as reports for well formed advance requests.
enum class advance_status : uint8_t {
    SUCCESS = 0,
    INVALID_REQUEST,
    DEPOSIT_INVALID_TOKEN,
    DEPOSIT_BALANCE_OVERFLOW,
    WITHDRAW_NO_FUNDS,
    WITHDRAW_VOUCHER_FAILED,
};

// POD for advance reports.
struct [[gnu::packed]] advance_report {
    advance_status status{};
};

// POD for inspect reports.
struct [[gnu::packed]] inspect_report {
    be256 balance{};
};

// POD for dapp state.
struct [[gnu::packed]] dapp_state {
    be256 balance{};
};

// Process an ERC-20 deposit request.
bool process_deposit(cmt_rollup_t *rollup, dapp_state *state, const erc20_deposit &deposit) {
    // Check token address.
    if (deposit.token_address != ERC20_TOKEN_ADDRESS) {
        std::ignore = std::fprintf(stderr, "[dapp] invalid deposit token address\n");
        std::ignore = rollup_emit_report(rollup, advance_report{advance_status::DEPOSIT_INVALID_TOKEN});
        return false;
    }
    // Add deposit amount to balance.
    be256 new_balance{};
    if (!be256_checked_add(new_balance, state->balance, deposit.amount)) {
        std::ignore = std::fprintf(stderr, "[dapp] deposit balance overflow\n");
        std::ignore = rollup_emit_report(rollup, advance_report{advance_status::DEPOSIT_BALANCE_OVERFLOW});
        return false;
    }
    state->balance = new_balance;
    // Flush dapp state to disk, so we can inspect its state from outside.
    dapp_flush_state(state);
    // Report that operation succeed.
    std::ignore = std::fprintf(stderr, "[dapp] successful deposit\n");
    std::ignore = rollup_emit_report(rollup, advance_report{advance_status::SUCCESS});
    return true;
}

// Process a ERC-20 withdraw request.
bool process_withdraw(cmt_rollup_t *rollup, dapp_state *state) {
    // Report an error if the balance is empty.
    if (state->balance == be256{}) {
        std::ignore = std::fprintf(stderr, "[dapp] no funds to withdraw\n");
        std::ignore = rollup_emit_report(rollup, advance_report{advance_status::WITHDRAW_NO_FUNDS});
        return false;
    }
    // Issue a voucher with the entire balance.
    const erc20_transfer transfer_payload = encode_erc20_transfer(ERC20_WITHDRAWAL_ADDRESS, state->balance);
    if (!rollup_emit_voucher(rollup, ERC20_TOKEN_ADDRESS, transfer_payload)) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to issue withdraw voucher\n");
        std::ignore = rollup_emit_report(rollup, advance_report{advance_status::WITHDRAW_VOUCHER_FAILED});
        return false;
    }
    // Only zero balance after successful voucher emission.
    state->balance = be256{};
    // Flush dapp state to disk, so we can inspect its state from outside.
    dapp_flush_state(state);
    // Report that operation succeed.
    std::ignore = std::fprintf(stderr, "[dapp] successful withdrawal\n");
    std::ignore = rollup_emit_report(rollup, advance_report{advance_status::SUCCESS});
    return true;
}

// Process advance state requests.
bool advance_state(cmt_rollup_t *rollup, dapp_state *state) {
    // Read the input.
    cmt_rollup_advance_t input{};
    const int err = cmt_rollup_read_advance_state(rollup, &input);
    if (err < 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to read advance state: %s\n", std::strerror(-err));
        std::ignore = rollup_emit_report(rollup, advance_report{advance_status::INVALID_REQUEST});
        return false;
    }
    // Deposit?
    if (input.msg_sender == ERC20_PORTAL_ADDRESS && input.payload.length == sizeof(erc20_deposit)) {
        erc20_deposit deposit{};
        std::copy_n(static_cast<const uint8_t *>(input.payload.data), sizeof(erc20_deposit),
            reinterpret_cast<uint8_t *>(&deposit)); // NOLINT(cppcoreguidelines-pro-type-reinterpret-cast)
        return process_deposit(rollup, state, deposit);
    }
    // Withdraw?
    if (input.msg_sender == ERC20_WITHDRAWAL_ADDRESS && input.payload.length == 0) {
        return process_withdraw(rollup, state);
    }
    // Invalid request.
    std::ignore = std::fprintf(stderr, "[dapp] invalid advance state request\n");
    std::ignore = rollup_emit_report(rollup, advance_report{advance_status::INVALID_REQUEST});
    return false;
}

// Process inspect state queries.
bool inspect_state(cmt_rollup_t *rollup, dapp_state *state) {
    // Inspect balance.
    std::ignore = std::fprintf(stderr, "[dapp] inspect balance request\n");
    return rollup_emit_report(rollup, inspect_report{state->balance});
}

}; // anonymous namespace

// Application main.
int main() {
    cmt_rollup_t rollup{};
    // Disable buffering of stderr to avoid dynamic allocations behind the scenes
    if (std::setvbuf(stderr, nullptr, _IONBF, 0) != 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to disable stderr buffering: %s\n", std::strerror(errno));
        return -1;
    }
    // Load dapp state from disk.
    auto *state = dapp_load_state<dapp_state>(STATE_BLOCK_DEVICE);
    if (state == nullptr) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to load dapp state\n");
        return -1;
    }
    // Initialize rollup device.
    const int err = cmt_rollup_init(&rollup);
    if (err != 0) {
        std::ignore = std::fprintf(stderr, "[dapp] unable to initialize rollup device: %s\n", std::strerror(-err));
        return -1;
    }
    // Process requests forever.
    std::ignore = std::fprintf(stderr, "[dapp] processing rollup requests...\n");
    bool accept_previous_request = true;
    while (true) {
        // Always continue, despite request failing or not.
        accept_previous_request =
            rollup_process_next_request(&rollup, state, advance_state, inspect_state, accept_previous_request);
    }
    // Unreachable code, return is intentionally omitted.
}
