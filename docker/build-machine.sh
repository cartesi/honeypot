#!/bin/bash
# (c) Cartesi and individual authors (see https://github.com/cartesi/honeypot/blob/main/AUTHORS)
# SPDX-License-Identifier: Apache-2.0 (see https://github.com/cartesi/honeypot/blob/main/LICENSE)
# Copyright Cartesi Pte. Ltd.

set -e

MACHINE_DIR=$1
ROLLUP_HTTP_SERVER_PORT=5004
NETWORK=$2

cartesi-machine \
    --assert-rolling-template \
    --ram-length=64Mi \
    --rollup \
    --flash-drive=label:root,filename:dapp.ext2 \
    --flash-drive=label:honeypot_dapp_state,length:4096 \
    --ram-image=linux.bin \
    --rom-image=rom.bin \
    --store=$MACHINE_DIR \
    -- "cd /home/dapp; \
        ./honeypot"
