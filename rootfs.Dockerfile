ARG UBUNTU_TAG=noble-20251001
ARG APT_UPDATE_SNAPSHOT=20251022T030400Z
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.2
ARG MACHINE_GUEST_TOOLS_SHA256SUM=c077573dbcf0cdc146adf14b480bfe454ca63aa4d3e8408c5487f550a5b77a41
ARG CHISEL_VERSION=1.3.0
ARG CHISEL_SHA256SUM=4781c6a8257bbe83836fe82357a8a511b68d21036814568597a1c547ebfbb70b
ARG DEBIAN_FRONTEND=noninteractive

################################
# base
FROM --platform=linux/riscv64 ubuntu:${UBUNTU_TAG} AS base

ARG APT_UPDATE_SNAPSHOT
ARG DEBIAN_FRONTEND
RUN <<EOF
set -eu
apt-get update
apt-get install -y --no-install-recommends ca-certificates
apt-get update --snapshot=${APT_UPDATE_SNAPSHOT}
apt-get install -y busybox-static
EOF

# Install guest tools
ARG MACHINE_GUEST_TOOLS_VERSION
ARG MACHINE_GUEST_TOOLS_SHA256SUM
ADD --checksum=sha256:${MACHINE_GUEST_TOOLS_SHA256SUM} \
  https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb \
  /tmp/
RUN dpkg -i /tmp/machine-guest-tools_riscv64.deb && \
    rm -f /tmp/machine-guest-tools_riscv64.deb

################################
# honeypot builder
FROM base AS builder

# Install build essential
ARG DEBIAN_FRONTEND
RUN apt-get install -y --no-install-recommends \
    build-essential

# Compile
WORKDIR /home/dapp
COPY Makefile .
COPY honeypot.cpp .
COPY config config
ENV SOURCE_DATE_EPOCH=0
ARG HONEYPOT_CONFIG=localhost
RUN make HONEYPOT_CONFIG=${HONEYPOT_CONFIG}

################################################################################
# chiselled stage
FROM base AS chiselled

# Get chisel binary
ARG CHISEL_VERSION
ARG CHISEL_SHA256SUM
ADD --checksum=sha256:${CHISEL_SHA256SUM} \
    https://github.com/canonical/chisel/releases/download/v${CHISEL_VERSION}/chisel_v${CHISEL_VERSION}_linux_riscv64.tar.gz \
    /tmp/chisel.tar.gz
RUN tar -xvf /tmp/chisel.tar.gz -C /usr/bin/

# Extract nodejs dependencies into the chiselled filesystem
WORKDIR /rootfs
RUN chisel cut \
  --release ubuntu-24.04 \
  --root /rootfs \
  --arch=riscv64 \
  # base rootfs dependencies
  base-files_base \
  base-passwd_data \
  # machine-emulator-tools dependencies
  busybox_bins \
  # dapp dependencies
  libstdc++6_libs

RUN busybox --install -s usr/bin

RUN <<EOF
  set -e
  mkdir -p proc sys dev mnt
  echo "dapp:x:1000:1000::/home/dapp:/bin/sh" >> etc/passwd
  echo "dapp:x:1000:" >> etc/group
  mkdir home/dapp
  chown 1000:1000 home/dapp
  sed -i '/^root/s/bash/sh/g' etc/passwd
EOF

################################
# rootfs builder
FROM --platform=linux/riscv64 scratch

COPY --from=base /usr/sbin/cartesi-init  /usr/sbin/cartesi-init
COPY --from=base /usr/sbin/xhalt /usr/sbin/xhalt
COPY --from=chiselled /rootfs /

COPY --chmod=755 <<EOF /etc/cartesi-init.d/dapp-state
chown dapp:dapp /dev/pmem1
EOF

# Install honeypot
WORKDIR /home/dapp
COPY --from=builder /home/dapp/honeypot .
