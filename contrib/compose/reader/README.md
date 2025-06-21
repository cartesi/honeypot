This is a `docker compose` project that reuses already existing containers to run a [Cartesi Rollups Node] for the Honeypot application.

[Cartesi Rollups Node]: https://github.com/cartesi/rollups-node

## TL;DR

Set the following environment variable to a valid Alchemy API key:

```sh
export ALCHEMY_API_KEY=
```

Finally, pick which chain you want to build the node for (`sepolia` or `mainnet`):

```sh
docker compose -f mainnet.yaml up
```

You can then query outputs through the Cartesi Rollups Node JSON-RPC API:

```sh
cast rpc --raw --rpc-url http://127.0.0.1:10011/rpc cartesi_listOutputs '{ "application": "honeypot" }'
```

You can send inspect requests through the Cartesi Rollups Node HTTP API:

```sh
curl -X POST http://127.0.0.1:10012/inspect/honeypot
```
