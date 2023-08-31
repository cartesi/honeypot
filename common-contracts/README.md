<!-- markdownlint-disable MD013 -->

# Overview

This project makes available a sample ERC-20 contract (`SimpleERC20`) that may be deployed to a given network.

## Building

You may build the `common-contracts` project as follows:

```shell
cd common-contracts
yarn && yarn build
```

## Deploying

Usually, DApps that require these contracts will specify their deployment within their corresponding `docker-compose.override.yml` file.

Additionally, the project can be deployed manually on the local development network by running `yarn deploy`. Manual deployment to other supported testnets can be done by executing `yarn deploy:<network>`.

## SimpleERC20 Contract

This is a simple contract to perform operations with fungible tokens.

To use it, you must first retrieve the contract address from the deployment data.
For the local development network, execute the following command:

```shell
ERC_20=$(jq '.address' ./deployments/localhost/SimpleERC20.json | \
    sed "s/[\",]//g")
```

With that in place, you can make transactions such as transferring tokens between accounts:

```shell
cast send $ERC_20 \
    "transfer(address,uint256)(bool)" \
    0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
    1000 \
    --mnemonic "test test test test test test test test test test test junk" \
    --mnemonic-index 0 \
    --rpc-url "http://localhost:8545"
```

The balance of an address can also be queried with the following command:

```shell
cast call $ERC_20 \
    "balanceOf(address)(uint32)" \
    0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
    --rpc-url "http://localhost:8545"
```
