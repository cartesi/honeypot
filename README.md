# Honeypot DApp

The Honeypot DApp is a [honeypot](https://en.wikipedia.org/wiki/Honeypot_(computing))-like DApp whose pot is the balance in _ETHER_ kept by the actual DApp.

The Honeypot DApp can receive deposits from any source, which are kept in the DApp balance for further withdrawal by a pre-defined account address (`WITHDRAWAL_ADDRESS`).

No other account is allowed to withdraw the funds.
Any input coming from an address other than the `WITHDRAWAL_ADDRESS` is discarded.

The DApp generates Reports for all operations.
A Voucher for the withdrawal of the pot is generated only when a request for withdrawal is accepted.

The back-end of the DApp is written in C++ and relies on the [Cartesi Rollups Low-level API](https://github.com/cartesi/rollups-examples/tree/main/echo-low-level#low-level-api) to communicate with Cartesi Rollups.

This document covers how to build, deploy and run the back-end of the DApp.
Additionaly, an external tool is suggested to act as a front-end to send requests to the DApp back-end.

> For a simpler example of a low-level DApp, refer to the [Echo Low-level DApp](https://github.com/cartesi/rollups-examples/tree/main/echo-low-level).

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

To build the DApp, run the following command:

```shell
docker buildx bake -f docker-bake.hcl -f docker-bake.override.hcl --load
```

## Running the application

To start the DApp, execute the following command:

```shell
docker compose up
```

To bring the DApp down along with its volumes, run the following command:

```shell
docker compose down -v
```

## Interacting with the application

The DApp depends on external tools to act as its front-end to send input requests to the back-end.
[Foundry's command-line tool for performing Ethereum RPC calls](https://book.getfoundry.sh/cast/), `cast` is going to be used for this purpose in this documentation.

In order to install the Foundry development toolchain, refer to their [installation guide](https://book.getfoundry.sh/getting-started/installation).

## Gathering DApp data

For all DApp operations, the DApp contract address is required.
In order to gather that in a local deployment, first [start up the DApp](./#running-the-application).
Then, execute the following command from the current directory to extract the address from its deployment data:

```shell
export DAPP_ADDRESS=$(cat deployments/localhost/dapp.json | jq -r '.address')
```

> In a local development environment, `$DAPP_ADDRESS` should be `0xF8C694fd58360De278d5fF2276B7130Bfdc0192A`.

### Performing Deposits

Any account can deposit funds into the pot.
In order to deposit some _ETHER_ via `cast`, proceed as follows:

```shell
cast send $DAPP_ADDRESS \
    "etherDeposit(bytes)" 0x00 \
    --value $ETHER_AMOUNT \
    --rpc-url localhost \
    --from $SIGNER_ADDRESS
```

Where:

- `$DAPP_ADDRESS` corresponds to the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `0x00` is a dummy value passed as parameter `bytes`, which corresponds to additional (layer-2) data to be parsed by the DApp;
It accepts any value, as long as properly ABI-encoded;
- `$ETHER_AMOUNT` is the amount of ETHER in _wei_ to be deposited;
-  `localhost` is the name of the local RPC Endpoint as defined at [`foundry.toml`](./foundry.toml);
- `$SIGNER_ADDRESS` is the account address that will sign the transaction, thus performing the deposit into the DApp.

Any deposit will be logged as a `Report` by the DApp.

> For more information about `cast send`, simply type `cast send --help` or refer to [Foundry's documentation](https://book.getfoundry.sh/reference/cast/cast-send).

### Checking the pot balance

To check the balance in _wei_, simply send the following command:

```shell
cast balance $DAPP_ADDRESS \
    --rpc-url localhost
```

> The pot balance may also be checked by sending an inspect request with any payload to the DApp, which will respond with the balance in _wei_.

### Sending inputs

In order to send inputs to the DApp, do the following:

```shell
cast send $DAPP_ADDRESS \
    "addInput(bytes)" $HEX_PAYLOAD \
    --rpc-url localhost \
    --from $SIGNER_ADDRESS
```

Where:

- `$DAPP_ADDRESS` corresponds to the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `$HEX_PAYLOAD` is an hex-encoded payload, which is mandatory, but will be ignored by the DApp;
-  `localhost` is the name of the local RPC Endpoint as defined at [`foundry.toml`](./foundry.toml);
- `$SIGNER_ADDRESS` is the account address that will sign the transaction, thus sending the input.

### Withdrawing the pot

Only a predefined address can withdraw funds from the pot. Refer to [`honeypot.h`](./honeypot.h) to check the `WITHDRAWAL_ADDRESS` used for this DApp.

In order to perform a withdrawal, just send any input (`Hello world`, in the example below) to the DApp using `WITHDRAWAL_ADDRESS`  as follows:

```shell
cast send $DAPP_ADDRESS \
    "addInput(bytes)" 0x48656c6c6f20776f726c64 \
    --rpc-url localhost \
    --from $WITHDRAWAL_ADDRESS
```

As a result, a `Voucher` will be generated, as long as the pot balance is greater than zero.
The Voucher, when executed, will perform the transfer of all funds previously held by the DApp to `WITHDRAWAL_ADDRESS`.

Any input sent from a different address that is not a deposit will be rejected, with a `Report` being generated accordingly.

## Running the back-end in host mode

*This application does not support `host` mode* because it uses the Cartesi Rollup device driver, which is available only inside the Cartesi Machine.

## Building the application for another network

The DApp is [built by default for a local deployment](#build), and have its configuration defined at a configuration [header file](./config/locahost/config.h), which contains the definition of the [`WITHDRAWAL_ADDRESS`](#honeypot-dapp).

In order to build the DApp for a network other than `localhost`, one needs to create a new configuration file (`config.h`)  and place it in a separate directory, setting the `WITHDRAWAL_ADDRESS` as exemplified in [`localhost/config.h`](.config/localhost/config.h).

> As a matter of convenience, the shell script [`hex2bytes.sh`](./util/hex2bytes.sh) may be used to convert an address hex string representation to an array of integer bytes to be included in the configuration file.

For example, for `goerli`, the file structure must be:

```shell
config/
└── goerli/
    └── config.h
```

With the configuration file in place, execute the build for the new network by overriding build argument `NETWORK` as follows:

```shell
docker buildx bake -f docker-bake.hcl -f docker-bake.override.hcl --load --set dapp.args.NETWORK=goerli
```

> Build argument `NETWORK` defaults to `localhost`.

> See [`docker buildx bake` documentation](https://docs.docker.com/engine/reference/commandline/buildx_bake/#set) for more details.

By setting `NETWORK`, the right configuration file is included (see [`Makefile`](./Makefile)) and the correct `WITHDRAWAL_ADDRESS` is used to build the DApp.
