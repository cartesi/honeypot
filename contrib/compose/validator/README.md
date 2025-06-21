This is a `docker compose` project that creates a container image with `cartesi-rollups-prt-node` binary and `honeypotv2` snapshot.

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
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION=1.0.0
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64=5c9a30c862cf87b0f206287b9537b7297a9a4e07b1557bc7249ffbaf54e65aa7
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64=9c8b1cfbb2df1fa1e542833b65ca8b63a6ecc391948f9b2a260e0661c08e7f56
```

There are 2 compose files, `sepolia.yaml` and `mainnet.yaml`, that should be used to honeypot dapp and prt-node deployment for the corresponding chain.


In case you want to deploy a prt-node validating honeypotv2 at sepolia.

```shell
export WEB3_PRIVATE_KEY=<your wallet private key>
export WEB3_RPC_URL=<your blockchain provider url>
docker compose -f sepolia.yaml up --build
```

This will build a container with cartesi-rollups-prt-node and honeypotv2 snapshot and run it right away.

### CPU and Memory

The YAML file defines constrained CPU and Memory, to align with what we're using currently for honeypotv2, but you can change at will.


```yaml
services:
  prt-node:
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 2GiB
```
