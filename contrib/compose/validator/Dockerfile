# cartesi-rollups-prt-node build arguments
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION=1.0.0
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64=5c9a30c862cf87b0f206287b9537b7297a9a4e07b1557bc7249ffbaf54e65aa7
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64=9c8b1cfbb2df1fa1e542833b65ca8b63a6ecc391948f9b2a260e0661c08e7f56

###
# base image stage
FROM debian:bookworm-20250520@sha256:bd73076dc2cd9c88f48b5b358328f24f2a4289811bd73787c031e20db9f97123 AS base

ARG DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-eu", "-c"]

RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    xxd
EOF

###
# cartesi-rollups-prt-node stage
FROM base AS cartesi-rollups-prt-node
ARG CARTESI_ROLLUPS_PRT_NODE_VERSION
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_AMD64
ARG CARTESI_ROLLUPS_PRT_NODE_CHECKSUM_ARM64
ARG TARGETARCH

RUN <<EOF
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
## honeypotv2-machine-snapshot stage
FROM base AS honeypotv2-machine-snapshot
ARG HONEYPOT_SNAPSHOT
ARG HONEYPOT_VERSION
ARG HONEYPOT_CHAIN_NAME
ARG HONEYPOT_CHECKSUM

WORKDIR /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}
RUN <<EOF
curl -fsSL https://github.com/cartesi/honeypot/releases/download/v${HONEYPOT_VERSION}/honeypot-snapshot-${HONEYPOT_CHAIN_NAME}.tar.gz \
    -o /tmp/honeypot-snapshot.tar.gz
echo "${HONEYPOT_CHECKSUM} /tmp/honeypot-snapshot.tar.gz" | sha256sum -c
tar -xzf /tmp/honeypot-snapshot.tar.gz -C /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}
test "${HONEYPOT_SNAPSHOT}" = "0x$(xxd -p -c32 /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}/hash)"
EOF

###
# final stage
FROM base
ARG HONEYPOT_SNAPSHOT

COPY --from=cartesi-rollups-prt-node        \
    /usr/local/bin/cartesi-rollups-prt-node \
    /usr/local/bin/cartesi-rollups-prt-node

COPY --from=honeypotv2-machine-snapshot                                 \
    /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}    \
    /var/lib/cartesi-rollups-prt-node/snapshots/${HONEYPOT_SNAPSHOT}

USER root
WORKDIR /var/lib/cartesi-rollups-prt-node
VOLUME [ "/var/lib/cartesi-rollups-prt-node/state" ]
CMD ["cartesi-rollups-prt-node", "pk"]
