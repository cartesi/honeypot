# syntax=docker/dockerfile:1

###
# Build arguments
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION=2.0.0
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64=4ddc4a18f46894b43f9a6c7283190133ba6ccfdd856b12cbf470a793bf68a08e
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64=3801b8a33de5cbcf55d10fa67eb18379c88cdc7c0140f2c845b14d2741c095d3

# baseimage args
ARG DEBIAN_TAG=trixie-20251103-slim
ARG DEBIAN_DIGEST=sha256:a347fd7510ee31a84387619a492ad6c8eb0af2f2682b916ff3e643eb076f925a

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
    amd64) curl -fsSL https://github.com/cartesi/dave/releases/download/v${CARTESI_ROLLUPS_PRT_NODE_VERSION}/cartesi-rollups-prt-node-Linux-gnu-x86_64.tar.gz \
            -o /tmp/cartesi-rollups-prt-node.tar.gz; \
        echo "${CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64}  /tmp/cartesi-rollups-prt-node.tar.gz" | sha256sum -c ;;
    arm64) curl -fsSL https://github.com/cartesi/dave/releases/download/v${CARTESI_ROLLUPS_PRT_NODE_VERSION}/cartesi-rollups-prt-node-Linux-gnu-${TARGETARCH}.tar.gz \
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
