# Honeypot DApp

The Honeypot DApp is a secure vault that accumulates ERC-20 token deposits from any source while restricting withdrawals to a single pre-configured address.

Operating like a digital honeypot, it accepts deposits freely but enforces strict withdrawal controls, ensuring only the designated withdrawal address can retrieve the accumulated funds.
The application maintains a persistent balance state, generates reports for all operations, and creates vouchers exclusively when authorized withdrawal requests are processed.

It demonstrates the security of an ERC-20 token deposit and withdrawal application built on the Cartesi Rollups framework.
It's written in C++20 using Cartesi Machine low level API with several safety and security measures, including comprehensive unit tests and stress tests.
It runs inside a RISC-V Cartesi Machine environment.

## Technical Details

### State Management

The application maintains a persistent state on a dedicated flash drive, storing the current token balance as a big-endian 256-bit integer.

### Supported Operations

#### Deposit

When triggered by a valid ERC-20 deposit request from any address, the application:
- Validates the correct token address is used
- Validates no arithmetic overflow occurs when adding to the balance
- Adds the deposited amount to the balance

#### Withdrawal

When triggered by a valid advance state request from the withdrawal address, the application:
- Validates that funds are available
- Issues a voucher to transfer the entire balance
- Resets the internal balance to zero

#### Balance Inspection

At any time, users can query the current balance of the honeypot through an inspect state.

### Security Features

The application is designed to be secure with the following features:

- Thorough input validation
- Arithmetic overflow protection for balance operations
- Error handling and reporting for every function call
- Implemented in modern and idiomatic C++20
- No use of dynamic memory allocation
- No use of exceptions or RTTI
- Compiled with strict C++ hardening flags
- Includes comprehensive Lua unit tests
- Includes stress tests with simulating thousands of random advance requests

## Building and Running

### Prerequisites

- Docker
- GNU Make
- Lua 5.4
- [cartesi/machine-emulator](https://github.com/cartesi/machine-emulator) 0.19.x
- [cartesi/xgenext2fs](https://github.com/cartesi/genext2fs)

### Building the Application

To build the application and create a machine snapshot:

```bash
make HONEYPOT_CONFIG=localhost
```

This will:
1. Compile the C++ application
2. Build the root filesystem
3. Create a machine snapshot

*NOTE*: Make sure to use the appropriate configuration in `HONEYPOT_CONFIG`, available options are listed in `config` sub-directory. When changing the configuration, perform `make clean` before building again.

### Running Tests

To run the basic test suite:

```bash
make test HONEYPOT_CONFIG=localhost
```

For stress testing (runs thousands of random operations):

```bash
make test-stress HONEYPOT_CONFIG=localhost
```

*NOTE*: Make sure to use the appropriate configuration in `HONEYPOT_CONFIG` used during build time.

## Project Structure

- `honeypot.cpp`: Main application code implementing the core logic
- `honeypot-config.hpp`: Configuration constants including addresses
- `rootfs.Dockerfile`: Docker configuration for building the DApp root filesystem
- `tests/`: Test suite made in Lua including unit and stress tests

## Configuration

The application uses the following configured addresses:

- `ERC20_PORTAL_ADDRESS`: The address of the Cartesi ERC-20 Portal
- `ERC20_WITHDRAWAL_ADDRESS`: The fixed address where tokens are withdrawn to
- `ERC20_TOKEN_ADDRESS`: The address of the accepted ERC-20 token

These values can be modified in `honeypot-config.hpp`.

## Development

You can check various development tasks in the help:

```bash
make help
```

## License

Apache-2.0 License - See the [LICENSE](LICENSE) file for details

## Contributors

See the [AUTHORS](AUTHORS) file for a list of contributors.
