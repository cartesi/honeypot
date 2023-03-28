# syntax=docker.io/docker/dockerfile:1.4
# The rootfs image MUST be built with support to boost
FROM cartesi/rootfs:devel as dapp-build

WORKDIR /opt/cartesi/dapp
COPY . .

ARG NETWORK=localhost

RUN make NETWORK=$NETWORK
