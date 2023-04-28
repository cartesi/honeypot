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

Manual deployment to other supported testnets can also be done.

As a first step, set a 12-word mnemonic phrase:

```shell
export MNEMONIC=<12-word backup phrase>
```

Then, in the case of deployments to Ethereum networks, which are done via Alchemy, set an Alchemy user API key:

```shell
export API_KEY=<user API key>
```

Finally, execute:

```shell
yarn deploy:<network>
```
