ARG UBUNTU_TAG=noble-20251001
ARG APT_UPDATE_SNAPSHOT=20251022T030400Z
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.2
ARG DEBIAN_FRONTEND=noninteractive

################################
# base
FROM --platform=linux/riscv64 ubuntu:${UBUNTU_TAG} as base

ARG APT_UPDATE_SNAPSHOT
ARG DEBIAN_FRONTEND
RUN <<EOF
set -eu
apt-get update
apt-get install -y --no-install-recommends ca-certificates
apt-get update --snapshot=${APT_UPDATE_SNAPSHOT}
apt-get remove -y --purge ca-certificates
apt-get autoremove -y --purge
EOF

################################
# honeypot builder
FROM base AS builder

# Install build essential
ARG DEBIAN_FRONTEND
RUN apt-get install -y --no-install-recommends \
    build-essential \
    busybox-static

# Install libcmt
ARG MACHINE_GUEST_TOOLS_VERSION
ADD https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb /tmp/
RUN dpkg -i /tmp/machine-guest-tools_riscv64.deb && \
    rm -f /tmp/machine-guest-tools_riscv64.deb

# Compile
WORKDIR /home/dapp
COPY Makefile .
COPY honeypot.cpp .
COPY config config
ENV SOURCE_DATE_EPOCH=0
ARG HONEYPOT_CONFIG=localhost
RUN make HONEYPOT_CONFIG=${HONEYPOT_CONFIG}

################################
# rootfs builder
FROM base

# Install dependencies
ARG DEBIAN_FRONTEND
RUN apt-get install -y --no-install-recommends \
    busybox-static

# Install guest tools
ARG MACHINE_GUEST_TOOLS_VERSION
ADD https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb /tmp/
RUN dpkg -i /tmp/machine-guest-tools_riscv64.deb && \
    rm -f /tmp/machine-guest-tools_riscv64.deb

# Strip non-determinism
RUN rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/*

# Give permission for dapp user to access /dev/pmem1
RUN mkdir -p /etc/cartesi-init.d && \
    echo "chown dapp:dapp /dev/pmem1" > /etc/cartesi-init.d/dapp-state && \
    chmod 755 /etc/cartesi-init.d/dapp-state

# Install honeypot
WORKDIR /home/dapp
COPY --from=builder /home/dapp/honeypot .
