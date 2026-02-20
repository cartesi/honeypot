# syntax=docker/dockerfile:1

###
# Build arguments
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION=2.0.3
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64=0171e5aa872ec798b5b0a38634784e2567eeac847577685e76f7879254137ba6
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64=c7bec0dbd0d019e16a1b7a6236e72d3f182982337893b30d981c2be5b5ed0c35

# baseimage args
ARG DEBIAN_TAG=trixie-20260202-slim
ARG DEBIAN_DIGEST=sha256:f6e2cfac5cf956ea044b4bd75e6397b4372ad88fe00908045e9a0d21712ae3ba

###
# base image stage
FROM debian:${DEBIAN_TAG}@${DEBIAN_DIGEST} AS base
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update

###
# cartesi-rollups-prt-node stage
FROM base AS cartesi-rollups-prt-node
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64
ARG TARGETARCH

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y --no-install-recommends curl ca-certificates tar

RUN <<EOF
set -euo pipefail

case "${TARGETARCH}" in
    amd64) curl -fsSL https://github.com/cartesi/dave/releases/download/v${CARTESI_ROLLUPS_PRT_NODE_VERSION}/cartesi-rollups-prt-${CARTESI_ROLLUPS_PRT_NODE_VERSION}-node-${TARGETARCH}.tar.gz \
            -o /tmp/cartesi-rollups-prt-node.tar.gz; \
        echo "${CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64}  /tmp/cartesi-rollups-prt-node.tar.gz" | sha256sum -c ;;
    arm64) curl -fsSL https://github.com/cartesi/dave/releases/download/v${CARTESI_ROLLUPS_PRT_NODE_VERSION}/cartesi-rollups-prt-${CARTESI_ROLLUPS_PRT_NODE_VERSION}-node-${TARGETARCH}.tar.gz \
            -o /tmp/cartesi-rollups-prt-node.tar.gz; \
        echo "${CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64}  /tmp/cartesi-rollups-prt-node.tar.gz" | sha256sum -c ;;
    *) echo "unsupported architecture: ${TARGETARCH}"; exit 1 ;;
esac

tar -xzf /tmp/cartesi-rollups-prt-node.tar.gz -C /usr/local/bin
rm /tmp/cartesi-rollups-prt-node.tar.gz
EOF

###
## honeypot-machine-snapshot stage
FROM base AS honeypot-machine-snapshot
ARG HONEYPOT_SNAPSHOT
ARG HONEYPOT_VERSION
ARG HONEYPOT_CHAIN_NAME
ARG HONEYPOT_CHECKSUM

WORKDIR /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}
ADD --checksum=sha256:${HONEYPOT_CHECKSUM} \
    https://github.com/cartesi/honeypot/releases/download/v${HONEYPOT_VERSION}/honeypot-snapshot-${HONEYPOT_CHAIN_NAME}.tar.gz \
    /tmp/honeypot-snapshot.tar.gz

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y --no-install-recommends xxd

RUN <<EOF
set -eu
tar -xzf /tmp/honeypot-snapshot.tar.gz -C /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}
test "${HONEYPOT_SNAPSHOT}" = "0x$(xxd -p -c32 /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}/hash)"
EOF

###
# final stage
FROM base
ARG HONEYPOT_SNAPSHOT

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y --no-install-recommends ca-certificates

COPY --from=cartesi-rollups-prt-node        \
    /usr/local/bin/cartesi-rollups-prt-node \
    /usr/local/bin/cartesi-rollups-prt-node

COPY --from=honeypot-machine-snapshot                                   \
    /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}    \
    /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}

USER root
WORKDIR /var/lib/cartesi-rollups-prt-node
VOLUME [ "/var/lib/cartesi-rollups-prt-node/state" ]
CMD ["cartesi-rollups-prt-node", "pk"]
