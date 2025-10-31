This is a `docker compose` project that creates a container image with `cartesi-rollups-prt-node` binary and `honeypotv3` snapshot.

## TL;DR

Define these variables with proper values:

```shell
export WEB3_PRIVATE_KEY=
export WEB3_RPC_URL=
```

Then, pick which chain you want to build the node for (`sepolia` or `mainnet`):

```shell
docker compose -f mainnet.yaml up --build
```

## Detailed version

The `Dockerfile` has some build arguments that defines some versions:

```Dockerfile
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION=2.0.0
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64=3801b8a33de5cbcf55d10fa67eb18379c88cdc7c0140f2c845b14d2741c095d3
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64=5bccca0ddbb3cffccb21d6f7a9ad2ca264391eb990af111223b2f866d63640f0
```

There are 2 compose files, `sepolia.yaml` and `mainnet.yaml`, that should be used to honeypot dapp and prt-node deployment for the corresponding chain.

In case you want to deploy a prt-node validating honeypotv3 at sepolia.

```shell
export WEB3_PRIVATE_KEY=<your wallet private key>
export WEB3_RPC_URL=<your blockchain provider url>
docker compose -f sepolia.yaml up --build
```

This will build a container with cartesi-rollups-prt-node and honeypotv3 snapshot and run it right away.

### CPU and Memory

The YAML file defines constrained CPU and Memory, to align with what we're using currently for honeypotv3, but you can change at will.

```yaml
services:
  prt-node:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 2GiB
```
