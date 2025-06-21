This is a `docker compose` project that creates a container image with the [Cartesi Rollups Node] and the Honeypot v2 snapshot.

[Cartesi Rollups Node]: https://github.com/cartesi/rollups-node

## TL;DR

Build `cartesi/rollups-node:devel` image from `next/2.0` branch:

```sh
git clone git@github.com:cartesi/rollups-node.git
cd rollups-node
git checkout next/2.0
make image
```

Set the following environment variable to a valid Alchemy API key:

```sh
export ALCHEMY_API_KEY=
```

Finally, pick which chain you want to build the node for (`sepolia` or `mainnet`):

```sh
docker compose -f mainnet.yaml up --build
```

You can then query outputs through the Cartesi Rollups Node JSON-RPC API:

```sh
cast rpc --raw --rpc-url http://127.0.0.1:10011/rpc cartesi_listOutputs '{ "application": "honeypot" }'
```
