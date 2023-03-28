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

Additionally, the project can be deployed manually on the local development network by running `yarn deploy`.
Manual deployment to other supported testnets can be done by executing `yarn deploy:<network>`.
