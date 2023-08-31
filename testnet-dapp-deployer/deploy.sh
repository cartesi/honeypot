#!/bin/sh

export CONSENSUS_ADDRESS=$(cat /deployments/$NETWORK/rollups.json | jq -r '.contracts.Authority.address')

echo "Deploying honeypot on network \"$NETWORK\" using consensus address \"$CONSENSUS_ADDRESS\"..."

cartesi-rollups create \
    --rpc "$RPC_URL" \
    --mnemonic "$MNEMONIC" \
    --templateHashFile /var/opt/cartesi/machine-snapshots/latest/hash \
    --outputFile "/deployments/$NETWORK/honeypot.json" \
    --consensusAddress "$CONSENSUS_ADDRESS"
