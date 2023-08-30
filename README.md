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

- `CONFIG_ERC20_PORTAL_ADDRESS`: byte representation of the address of the ERC-20 portal;
- `CONFIG_ERC20_CONTRACT_ADDRESS`: byte representation of the address of the only ERC-20 contract accepted for deposits;
In this case, it corresponds to `0x291a575C83aBcBF92Cae9c611f83416F2e17071B`, which refers to `SimpleERC20`, the contract deployed locally via the [`common-contracts` container](./common-contracts/README.md).
- `CONFIG_ERC20_WITHDRAWAL_ADDRESS`: byte representation of the only *withdrawal address* allowed.
In this case, it corresponds to `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (account index `1` in the local Hardhat node).

### Customizing the DApp for other networks

In order to configure the DApp for a network other than `localhost`, one needs to create a new configuration file (`config.h`) and place it in a separate directory.

For example, for the Sepolia network, the file structure would be:

```shell
config/
└── sepolia/
    └── config.h
```

File `config.h` must contain proper values for `CONFIG_ERC20_PORTAL_ADDRESS`, `CONFIG_ERC20_CONTRACT_ADDRESS`, and `CONFIG_ERC20_WITHDRAWAL_ADDRESS`.

## Building the application

To build the DApp for a local environment, simply execute:

```shell
docker buildx bake \
    --load
```

### Building for other networks

In order to build the DApp for another network, simply override build argument `NETWORK`, which defaults to `localhost`, by setting a value for `*.args.NETWORK`, so the [configuration file related to the selected network](#customizing-the-dapp-for-other-networks) is included during the build process (see [`Makefile`](./Makefile)).

For example, assuming there's a valid configuration file for the Sepolia network, set `*.args.NETWORK` to `sepolia` during the build as follows:

```shell
docker buildx bake \
    --load \
    --set *.args.NETWORK=sepolia
```

> See [documentation](https://docs.docker.com/engine/reference/commandline/buildx_bake/#set) for more details about overriding target configurations for `docker buildx bake`.

## Running the application

To start the DApp locally, execute the following command:

```shell
docker compose up
```

On the other hand, to bring the DApp down along with its volumes, run the following command:

```shell
docker compose down -v
```

Notice that when running locally, the chain used is [Hardhat](https://hardhat.org/). Due to a [bug](https://github.com/NomicFoundation/hardhat/issues/2053) in this chain, it is normal to see the following warning in the logs. Do not bother, it is not a problem.

```shell
WARN background_process: eth_block_history::block_subscriber: `listen_and_broadcast` error `New block subscriber timeout: timed out`, retrying subscription
```

## Interacting with the application

The DApp depends on external tools to perform deposits or send withdrawal requests to the DApp back-end.
Foundry's command-line tool for performing Ethereum RPC calls, [`cast`](https://book.getfoundry.sh/cast/), is going to be used for this purpose in this documentation.

To install the Foundry development toolchain to have `cast` available, check the [installation guide](https://book.getfoundry.sh/getting-started/installation).

### Gathering DApp data

A few Cartesi Rollups addresses are required for interactions with the Honeypot DApp.

In order to gather them, first [start up the DApp](./#running-the-application).

For `localhost`, execute the following commands to extract the addresses from the deployment data:

```shell
export DAPP_ADDRESS=$(cat deployments/localhost/dapp.json | jq -r '.address')
export INPUT_BOX_ADDRESS=$(cat deployments/localhost/InputBox.json | jq -r '.address')
export ERC20_PORTAL_ADDRESS=$(cat deployments/localhost/ERC20Portal.json | jq -r '.address')
export ERC20_ADDRESS=$(cat common-contracts/deployments/localhost/SimpleERC20.json | jq -r '.address')
```

The following values are expected for the variables above:

- `$DAPP_ADDRESS`: `0x70ac08179605AF2D9e75782b8DEcDD3c22aA4D0C`;
- `$INPUT_BOX_ADDRESS`: `0x59b22D57D4f067708AB0c00552767405926dc768`;
- `$ERC20_PORTAL_ADDRESS`: `0x9C21AEb2093C32DDbC53eEF24B873BDCd1aDa1DB`;
- `$ERC20_ADDRESS`: `0x291a575C83aBcBF92Cae9c611f83416F2e17071B`.

### Depositing funds

Any account can deposit funds into the pot.
However, in order to do that, a proper allowance must be approved beforehand.

#### Approving allowances

In order to request an allowance to be approved, execute the following command from the current directory:

```shell
cast send $ERC20_ADDRESS \
    "approve(address,uint256)" \
        $ERC20_PORTAL_ADDRESS \
        $AMOUNT \
    --rpc-url $RPC_URL \
    --from $SIGNER_ADDRESS \
    --private-key $PRIVATE_KEY
```

Where:

- `$ERC20_ADDRESS` is the hex representation of the ERC-20 contract address to be used;
- `$ERC20_PORTAL_ADDRESS` is the hex representation of the ERC-20 Portal address, as explained in [Gathering DApp data](#gathering-dapp-data).
In this case, `$DAPP_ADDRESS`, which is also the Rollups address, is the *spender*;
- `$AMOUNT` is the amount of tokens to be requested in the allowance;
- `$RPC_URL` is the URL of the RPC endpoint to be used;
- `$SIGNER_ADDRESS` is the hex representation of the account address that will sign the transaction, thus performing the deposit into the DApp;
- `$PRIVATE_KEY` (**mandatory for testnets**) is the private key associated with `$SIGNER_ADDRESS`.

For example, an allowance request coming from account address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (account index `0` in a local Hardhat node deployment) on localhost using [`SimpleERC20`](#configuring-the-application) (`0x291a575C83aBcBF92Cae9c611f83416F2e17071B`) as the ERC-20 contract would look like this:

```shell
cast send 0x291a575C83aBcBF92Cae9c611f83416F2e17071B \
    "approve(address,uint256)" \
        0x9C21AEb2093C32DDbC53eEF24B873BDCd1aDa1DB \
        100000000000000000000 \
    --rpc-url http://localhost:8545 \
    --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

> For more information about `cast send`, simply type `cast send --help` or refer to [Foundry's documentation](https://book.getfoundry.sh/reference/cast/cast-send).
>
> For more information about function `approve` refer to the [OpenZeppellin documentation](https://docs.openzeppelin.com/contracts/2.x/api/token/erc20#IERC20-approve-address-uint256-).

#### Performing deposits

With an allowance in place, execute the following command from the current directory to perform a deposit:

```shell
cast send $ERC20_PORTAL_ADDRESS \
    "depositERC20Tokens(address,address,uint256,bytes)" \
        $ERC20_ADDRESS \
        $DAPP_ADDRESS \
        $AMOUNT \
        "" \
    --rpc-url $RPC_URL \
    --from $SIGNER_ADDRESS \
    --private-key $PRIVATE_KEY
```

Where:

- `$ERC20_PORTAL_ADDRESS` is the hex representation of the ERC-20 Portal address, as explained in [Gathering DApp data](#gathering-dapp-data).
- `$ERC20_ADDRESS` is the hex representation of the ERC-20 contract address to be used;
It accepts any value, as long as properly ABI-encoded;
- `$DAPP_ADDRESS` is the hex representation of the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `$AMOUNT` is the amount of `$ERC20_ADDRESS` to be deposited;
- `""` is a 'no-value' passed as parameter `bytes`, which corresponds to additional (layer-2) data to be parsed by the DApp;
- `$RPC_URL` is the URL of the RPC endpoint to be used;
- `$SIGNER_ADDRESS` is the hex representation of the account address that will sign the transaction, thus performing the deposit into the DApp;
- `$PRIVATE_KEY` (**mandatory for testnets**) is the private key associated with `$SIGNER_ADDRESS`.

Any deposit will be logged as a `Report` by the DApp.

For example, a deposit performed by account `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` on localhost using `SimplerERC20` would be similar to this:

```shell
cast send 0x9C21AEb2093C32DDbC53eEF24B873BDCd1aDa1DB \
    "depositERC20Tokens(address,address,uint256,bytes)" \
        0x291a575C83aBcBF92Cae9c611f83416F2e17071B \
        0x70ac08179605AF2D9e75782b8DEcDD3c22aA4D0C \
        100000000000000000000 \
        "" \
    --rpc-url http://localhost:8545 \
    --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### Checking the pot balance

The pot balance may be retrieved at all times by sending an [inspect-state request](https://docs.cartesi.io/cartesi-rollups/api/inspect/inspect/#inspect-dapp-state-rest-api) with a non-empty payload to the DApp as follows:

```shell
curl localhost:5005/inspect/
```

The response from such a request will contain the amount of tokens held at layer-2, which constitutes the pot balance.
Here's a sample response from the DApp:

```shell
{
    "payload": "0x0000000000000000000000000000000000000000000000056bc75e2d63100000"
}
```

Notice that the pot balance may differ over time from the actual ERC-20 balance held by the DApp on layer-1. This is because when a withdrawal request is processed by the DApp, a corresponding voucher is emitted and the pot balance on layer-2 changes immediately. However, the DApp's ERC-20 balance on layer-1 will only change when that voucher is finalized and executed on layer-1.

#### Retrieving layer-1 balances

To check the layer-1 balance of any account address, including the DApp itself, simply execute the following command from the current directory:

```shell
cast call $ERC20_ADDRESS \
    "balanceOf(address)" \
        $ACCOUNT_ADDRESS \
    --rpc-url $RPC_URL
```

Where:

- `$ERC20_ADDRESS` is the hex representation of the address of the ERC-20 contract to be used; and
- `$ACCOUNT_ADDRESS` is the hex representation of the account address to be checked;
- `$RPC_URL` is the URL of the RPC endpoint to be used.

The call above will return an hex representation of the balance.

For example, in a local environment, the DApp balance for `SimpleERC20` may be retrieved as follows:

```shell
cast call 0x291a575C83aBcBF92Cae9c611f83416F2e17071B \
    "balanceOf(address)" \
        0x70ac08179605AF2D9e75782b8DEcDD3c22aA4D0C \
    --rpc-url http://localhost:8545
```

### Withdrawing the pot

In order to perform a withdrawal request, just send an empty input (`""`, in the example below) to the DApp as follows:

```shell
cast send $INPUT_BOX_ADDRESS \
    "addInput(address,bytes)" \
    $DAPP_ADDRESS \
        "" \
    --from $SIGNER_ADDRESS \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL
```

Where:

- `$INPUT_BOX_ADDRESS` is the hex representation of the InputBox address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `$DAPP_ADDRESS` is the hex representation of the DApp address, as explained in [Gathering DApp data](#gathering-dapp-data);
- `""` is the actual input;
- `$SIGNER_ADDRESS` is the hex representation of the account address that will sign the withdrawal request;
- `$PRIVATE_KEY` (**mandatory for testnets**) is the private key to associated to `$SIGNER_ADDRESS`.
- `$RPC_URL` is the URL of the RPC endpoint to be used.

As repeatedly stated throughout this document, only withdrawal requests coming from the predefined *withdrawal address* will be fulfilled by the Honeypot DApp.

So, whenever `$SIGNER_ADDRESS` matches the correct *withdrawal address*, the request will be accepted and, as long as the pot balance is greater than zero, a `Voucher` will be generated as a result. Such voucher, when executed, will perform the transfer of all funds previously held by the DApp to the *withdrawal address*.

Any withdrawal request sent from a different address will be rejected, with a `Report` being generated accordingly.

In a local environment, a successful withdrawal request coming from *withdrawal address* `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` would look like this:

```shell
cast send 0x59b22D57D4f067708AB0c00552767405926dc768 \
    "addInput(address,bytes)" \
        0x70ac08179605AF2D9e75782b8DEcDD3c22aA4D0C \
        "" \
    --from 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
    --rpc-url http://localhost:8545
```

## Deploying the DApp

Deploying a new Cartesi DApp to a blockchain requires creating a smart contract on that network, as well as running a Cartesi Validator Node for the DApp.

The first step is to build the DApp's back-end machine, which will produce a hash that serves as a unique identifier.

```shell
docker buildx bake \
    machine \
    --load \
    --set *.args.NETWORK=$NETWORK
```

Where `$NETWORK` identifies the target network to which the DApp must be built.

For example, to build the DApp to be deployed to the Sepolia testnet, execute the following:

```shell
docker buildx bake \
    machine \
    --load \
    --set *.args.NETWORK=sepolia
```

Once the machine docker image is ready, it may be used to deploy a corresponding Rollups smart contract.
This requires you to specify the account and RPC gateway to be used when submitting the deploy transaction on the target network, which can be done by defining the following environment variables:

```shell
export MNEMONIC=<user sequence of twelve words>
export RPC_URL=<https://your.rpc.gateway>
```

For example, to deploy on the Sepolia testnet using an Alchemy RPC node, you could execute:

```shell
export MNEMONIC=<user sequence of twelve words>
export RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<API_KEY>
```

With that in place, you can submit a deploy transaction to the Cartesi DApp Factory contract on the target network by executing the following command:

```shell
docker compose \
    --env-file env.$NETWORK \
    -f deploy-testnet.yml \
    up
```

Here, `env.$NETWORK` specifies general parameters for the target network, like its name and chain ID. In the case of Sepolia, the command would be:

```shell
docker compose \
    --env-file env.sepolia \
    -f deploy-testnet.yml \
    up
```

This will create a file at `../deployments/$NETWORK/honeypot.json` with the deployed contract's address.
Once the command finishes, it is advisable to stop the docker compose and remove the volumes created when executing it.

```shell
docker compose \
    --env-file env.$NETWORK \
    -f deploy-testnet.yml \
    down -v
```

After that, a corresponding Cartesi Validator Node must also be instantiated in order to interact with the deployed smart contract on the target network and handle the back-end logic of the DApp.
Aside from the environment variables defined before, the node will also need a secure websocket endpoint for the RPC gateway (`WSS_URL`).

For example, for Sepolia via Alchemy, the following additional environment variable must be defined:

```shell
export WSS_URL=wss://eth-sepolia.g.alchemy.com/v2/<API_KEY>
```

Make sure to build the node for the target network as explained at [Building for other networks](#building-for-other-networks).
Then, the node itself can be started by running `docker compose` as follows:

```shell
docker compose \
    --env-file env.$NETWORK \
    -f docker-compose-testnet.yml \
    up
```

Specifically for Sepolia, execute:

```shell
docker compose \
    --env-file env.sepolia \
    -f docker-compose-testnet.yml \
    up
```

### Interacting with a deployed DApp

In order to interact with a deployed DApp, retrieve the addresses of contracts `InputBox` and `ERC20Portal` for the associated network from the [`@cartesi/rollups` npm package](https://www.npmjs.com/package/@cartesi/rollups).

For example, for the Sepolia network, the deployment data can be found at directory `/deployments/sepolia` and be used to define Variables `INPUT_BOX_ADDRESS`, `ERC20_PORTAL_ADDRESS`.

Besides that, `DAPP_ADDRESS` may be retrieved from the DApp deployment data (e.g, `../deployments/sepolia/honeypot.json`, for the Sepolia network), as noted at [Deploying the DApp](#deploying-the-dapp).

With such configuration in place, one can interact with the DApp as explained at [Interacting with the application](#interacting-with-the-application).

## Running the back-end in host mode

*This application does not support `host` mode* because it uses the Cartesi Rollup device driver, which is available only inside the Cartesi Machine.

## Integration Tests

This repository comes with a set of integration tests meant to be executed on top of Honeypot DApp.

The tests are written in Typescript and use frameworks [Mocha](https://mochajs.org/) and [Chai](https://www.chaijs.com/api/).
They also use [Foundry Cast](https://github.com/foundry-rs/foundry) as tool to interact with the DApp.

To run the tests locally, go to the `tests` directory and proceed as indicated in the [tests README](tests/README.md).
