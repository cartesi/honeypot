<!-- markdownlint-disable MD013 -->

# Honeypot DApp

The Honeypot DApp is a [honeypot](https://en.wikipedia.org/wiki/Honeypot_(computing))-like DApp whose pot is the balance of a [pre-configured ERC-20 token](#configuring-the-application) kept by the actual DApp.

The Honeypot DApp may receive deposits from any source, which are kept in the DApp balance for further withdrawal by a predefined *withdrawal address*, only.
No other account is allowed to withdraw the funds.
Any withdrawal request coming from an address other than the *withdrawal address* will be discarded.

The DApp generates Reports for all operations.
A Voucher for the withdrawal of the pot is generated only when a request for withdrawal is accepted.

The back-end of the DApp is written in C++ and relies on the [Cartesi Rollups Low-level API](https://github.com/cartesi/rollups-examples/tree/main/echo-low-level#low-level-api) to communicate with Cartesi Rollups.

This document covers how to build, deploy and run the back-end of the DApp.
Additionaly, an external tool is suggested to act as a front-end to send requests to the DApp back-end.

> For a simpler example of a low-level DApp, refer to the [Echo Low-level DApp](https://github.com/cartesi/rollups-examples/tree/main/echo-low-level).

## Configuring the application

The application comes configured to be run in a local environment by default.
Such configuration is available at [config/localhost/config.h](./config/localhost/config.h), which defines:

- `ERC20_CONTRACT_ADDRESS`: byte representation of the address of the only ERC-20 contract accepted for deposits.
In this case, it corresponds to `0xc5a5C42992dECbae36851359345FE25997F5C42d`, which refers to `SimpleERC20`, the contract deployed locally via the [`common-contracts` container](./common-contracts/README.md).
- `WITHDRAWAL_ADDRESS`: byte representation of the only *withdrawal address* allowed.
In this case, it corresponds to `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (account index `1` in the local Hardhat node).

### Customizing the DApp for other networks

In order to configure the DApp for a network other than `localhost`, one needs to create a new configuration file (`config.h`) and place it in a separate directory, setting proper values for `ERC20_CONTRACT_ADDRESS` and `WITHDRAWAL_ADDRESS`.

For example, for the Goerli network, the file structure would be:

```shell
config/
└── goerli/
    └── config.h
```

> As a matter of convenience, shell script [`hex2bytes.sh`](./util/hex2bytes.sh) may be used to convert an address hex string representation to an array of integer bytes to be included in the configuration file.

## Building the application

### Requirements

This DApp relies on [Boost's Multiprecision library](https://www.boost.org/doc/libs/1_73_0/libs/multiprecision/doc/html/boost_multiprecision/intro.html) and, thus, must be built on top of a special [rootfs](https://github.com/cartesi/image-rootfs) image, configured with `boost` enabled among its libraries.

To build such an image, proceed as follows:

1. Checkout tag [v0.15.0](https://github.com/cartesi-corp/image-rootfs/tree/v0.15.0) from the repository and init its git submodules

```shell
git clone https://github.com/cartesi/image-rootfs --branch v0.15.0
cd image-rootfs
git submodule update --init
```

2. Create a baseline image. It's going to take a lot of time.

```shell
make
```

3. With the baseline image in place, open the Buildroot configuration UI:

```shell
make config
```

4. Once there, go to `Target packages -> Libraries -> Other` and select all Boost packages (`boost*`), just in case.
5. Save and exit.
6. **Answer `no` to the question `Do you wish to build it now?`**.
7. Increase the file system size (managed by `BR2_TARGET_ROOTFS_EXT2_SIZE`) in the Buildroot configuration file (`cartesi-buildroot-config`) to fit the Boost libraries.

```shell
sed -i 's/BR2_TARGET_ROOTFS_EXT2_SIZE=\"68M\"/BR2_TARGET_ROOTFS_EXT2_SIZE=\"100M\"/g' cartesi-buildroot-config
```

8. Build the new image.

```shell
make
```

9. Tag the new image to match the name expected by the DApp build (see [`Dockerfile`](./Dockerfile)).

```shell
make tag devel
```

> For more information on how to build `rootfs` images, please refer to [the repository documentation](https://github.com/cartesi/image-rootfs).

### Build

To build the DApp for a local environment, simply execute:

```shell
docker buildx bake \
    -f docker-bake.hcl \
    -f docker-bake.override.hcl \
    --load
```

### Building for other networks

In order to build the DApp for another network, simply override build argument `NETWORK`, which defaults to `localhost`, by setting a value to `dapp.args.NETWORK`, so the [configuration file related to the selected network](#customizing-the-dapp-for-other-networks) is included during the build process (see [`Makefile`](./Makefile)).

For example, assuming there's a valid configuration file for the Goerli network, set `dapp.args.NETWORK` to `goerli` during the build as follows:

```shell
docker buildx bake \
    -f docker-bake.hcl \
    -f docker-bake.override.hcl \
    --load \
    --set dapp.args.NETWORK=goerli
```

> See [documentation](https://docs.docker.com/engine/reference/commandline/buildx_bake/#set) for more details about overriding target configurations for `docker buildx bake`.

## Running the application

To start the DApp, execute the following command:

```shell
docker compose up
```

On the other hand, to bring the DApp down along with its volumes, run the following command:

```shell
docker compose down -v
```

## Interacting with the application

The DApp depends on external tools to perform deposits or send withdrawal requests to the DApp back-end.
Foundry's command-line tool for performing Ethereum RPC calls, [`cast`](https://book.getfoundry.sh/cast/), is going to be used for this purpose in this documentation.

To install the Foundry development toolchain to have `cast` available, check the [installation guide](https://book.getfoundry.sh/getting-started/installation).

> A pre-configured RPC endpoint (`localhost`) is available to help with interactions in a local environment (see [`foundry.toml`](./foundry.toml)).

### Gathering DApp data

The DApp contract address is required for all interactions with the Honeypot.
In order to gather the address used in a local deployment, first [start up the DApp](./#running-the-application).
Then, execute the following command from the current directory to extract it from the DApp deployment data:

```shell
export DAPP_ADDRESS=$(cat deployments/localhost/dapp.json | \
                        jq -r '.address')
```

> In a local environment, `$DAPP_ADDRESS` should be `0xF8C694fd58360De278d5fF2276B7130Bfdc0192A`.

### Depositing funds

Any account can deposit funds into the pot.
However, in order to do that, a proper allowance must be approved beforehand.

#### Approving allowances

In order to request an allowance to be approved, execute the following command from the current directory:

```shell
cast send $ERC20_ADDRESS \
    "approve(address,uint256)" \
        $DAPP_ADDRESS \
        $AMOUNT \
    --rpc-url localhost \
    --from $SIGNER_ADDRESS
```

Where:

- `$ERC20_ADDRESS` is the hex representation of the ERC-20 contract address to be used;
- `$DAPP_ADDRESS` is the hex representation of the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data).
In this case, `$DAPP_ADDRESS`, which is also the Rollups address, is the *spender*;
- `$AMOUNT` is the amount of tokens to be requested in the allowance;
- `localhost` is the name of the local RPC Endpoint as defined at [`foundry.toml`](./foundry.toml);
- `$SIGNER_ADDRESS` is the hex representation of the account address that will sign the transaction, thus performing the deposit into the DApp.

For example, an allowance request coming from account address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (account index `0` in a local hardhat node deployment) on localhost using [`SimpleERC20`](#configuring-the-application) as the ERC-20 contract would look like this:

```shell
cast send 0xc5a5c42992decbae36851359345fe25997F5c42d \
    "approve(address,uint256)" \
        0xf8c694fd58360de278d5ff2276b7130bfdc0192a \
        100000000000000000000 \
    --rpc-url localhost \
    --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

> For more information about `cast send`, simply type `cast send --help` or refer to [Foundry's documentation](https://book.getfoundry.sh/reference/cast/cast-send).
>
> For more information about function `approve` refer to the [OpenZeppellin documentation](https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#IERC20-approve-address-uint256-).

#### Performing deposits

With an allowance in place, execute the following command from the current directory to perform a deposit:

```shell
cast send $DAPP_ADDRESS \
    "erc20Deposit(address,uint256,bytes)" \
        $ERC20_ADDRESS \
        $AMOUNT \
        0x00 \
    --rpc-url localhost \
    --from $SIGNER_ADDRESS
```

Where:

- `$DAPP_ADDRESS` is the hex representation of the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `$ERC20_ADDRESS` is the hex representation of the ERC-20 contract address to be used;
It accepts any value, as long as properly ABI-encoded;
- `$AMOUNT` is the amount of `$ERC20_ADDRESS` to be deposited;
- `0x00` is a dummy value passed as parameter `bytes`, which corresponds to additional (layer-2) data to be parsed by the DApp;
- `localhost` is the name of the local RPC Endpoint as defined at [`foundry.toml`](./foundry.toml);
- `$SIGNER_ADDRESS` is the hex representation of the account address that will sign the transaction, thus performing the deposit into the DApp.

Any deposit will be logged as a `Report` by the DApp.

For example, a deposit performed by account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` on localhost using `SimplerERC20` would be similar to this:

```shell
cast send 0xf8c694fd58360de278d5ff2276b7130bfdc0192a \
    "erc20Deposit(address,uint256,bytes)" \
        0xc5a5c42992decbae36851359345fe25997F5c42d \
        100000000000000000000 \
        0x00 \
    --rpc-url localhost \
    --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### Checking the pot balance

To check the balance of any account address, including the DApp itself, simply execute the following command from the current directory:

```shell
cast call $ERC20_ADDRESS \
    "balanceOf(address)" \
        $ACCOUNT_ADDRESS \
    --rpc-url localhost
```

Where:

- `$ERC20_ADDRESS` is the hex representation of the address of the ERC-20 contract to be used; and
- `$ACCOUNT_ADDRESS` is the hex representation of the account address to be checked.

The call above will return an hex representation of the balance.

For example, in a local environment, the DApp balance may be retrieved as follows:

```shell
cast call 0xc5a5c42992decbae36851359345fe25997F5c42d \
    "balanceOf(address)" \
        0xf8c694fd58360de278d5ff2276b7130bfdc0192a \
    --rpc-url localhost
```

> The DApp balance may also be retrieved by sending an [inspect-state request](https://docs.cartesi.io/cartesi-rollups/api/inspect/inspect/#inspect-dapp-state-rest-api) with any payload to the DApp.

### Withdrawing the pot

In order to perform a withdrawal request, just send any input (`0x00`, in the example below) to the DApp as follows:

```shell
cast send $DAPP_ADDRESS \
    "addInput(bytes)" \
        0x00 \
    --rpc-url localhost \
    --from $SIGNER_ADDRESS
```

Where:

- `$DAPP_ADDRESS` is the hex representation of the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `$SIGNER_ADDRESS` is the hex representation of the account address that will sign the withdrawal request.

As repeatedly stated throughout this document, only withdrawal requests coming from the predefined *withdrawal address* will be fulfilled by the Honeypot DApp.

So, whenever `$SIGNER_ADDRESS` matches the correct *withdrawal address*, the request will be accepted and, as long as the pot balance is greater than zero, a `Voucher` will be generated as a result. Such voucher, when executed, will perform the transfer of all funds previously held by the DApp to the *withdrawal address*.

Any withdrawal request sent from a different address will be rejected, with a `Report` being generated accordingly.

In a local environment, a successful withdrawal request coming from *withdrawal address* `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` would look like this:

```shell
cast send 0xf8c694fd58360de278d5ff2276b7130bfdc0192a \
    "addInput(bytes)" \
        0x00 \
    --rpc-url localhost \
    --from 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

## Running the back-end in host mode

*This application does not support `host` mode* because it uses the Cartesi Rollup device driver, which is available only inside the Cartesi Machine.
