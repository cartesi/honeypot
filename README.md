# Honeypot DApp

This is a [Honeypot](https://en.wikipedia.org/wiki/Honeypot_(computing))-like DApp whose pot is the balance kept by the actual DApp.

The Honeypot DApp can receive deposits in CTSI from any source, which are kept in the DApp balance for further withdrawal by a pre-defined account address (`WITHDRAWAL_ADDRESS`).

No other account is allowed to withdraw the funds, any input coming from an address other than the `WITHDRAWAL_ADDRESS` is discarded.

**The DApp generate Reports for all operations and a Voucher when a request for withdrawal is accepted.**

The DApp is written in C++ and relies on the [Cartesi Rollups Low-level API](https://github.com/cartesi/rollups-examples/tree/main/echo-low-level#low-level-api) to interact with Cartesi Rollups.

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
5. Save and exit
6. **Answer `no` to the question `Do you wish to build it now?`**
7. Increase the file system size (managed by `BR2_TARGET_ROOTFS_EXT2_SIZE`) in the Buildroot configuration file (`cartesi-buildroot-config`)to fit the new libraries.

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

## Running

To start the DApp, execute the following command:

```shell
docker compose up
```

To bring the DApp down, run the following command:

```shell
docker compose down -v
```

## Interacting with the application

The [frontend-console](https://github.com/cartesi/rollups-examples/tree/main/frontend-console) application may be used to interact with the DApp.
Ensure that the [application has already been built](https://github.com/cartesi/rollups-examples/tree/main/frontend-console/README.md#building) before using it.

To perform any of the operations listed below, first open a separate terminal window and go to the `frontend-console` directory (`$FC_DIR`):

```shell
cd $FC_DIR
```

### Performing Deposits

Any account can deposit funds into the pot.

As an example, deposit some CTSI using the default user account as follows:

```shell
yarn start erc20 deposit --amount 99999999999999
```

> Any deposit will be logged as a `Report`.

### Checking the pot balance

To check the balance, simply send and inspect request to the DApp with any payload (`IGNORED`, in the example below):

```shell
yarn start inspect --payload IGNORED
```

### Withdrawing the pot

Only a predefined address can withdraw funds from the pot. Refer to [`honeypot.h`](./honeypot.h) to check the `WITHDRAWAL_ADDRESS` used for this DApp.


In order to perform a withdrawal, send any input (`ANY`, in the example below) to the DApp using the predefined address (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8` in the example below):

```shell
yarn start input send --payload ANY --accountIndex 1
```

As a result, a `Voucher` will be generated, which, when executed, will perform the transfer of all funds previously held by the DApp to `WITHDRAWAL_ADDRESS`.

> Any other input will be rejected, with a `Report` being generated accordingly.

## Running the back-end in host mode

*This application does not support `host` mode* because it uses the Cartesi Rollup device driver, which is available only inside the Cartesi Machine.
