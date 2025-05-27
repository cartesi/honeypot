################################
# honeypot builder
FROM --platform=linux/riscv64 riscv64/ubuntu:noble-20250404 AS builder

# Install build essential
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    busybox-static=1:1.36.1-6ubuntu3.1 \
    build-essential=12.10ubuntu1

# Install libcmt
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.1
ADD https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb /tmp/
RUN dpkg -i /tmp/machine-guest-tools_riscv64.deb

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
FROM --platform=linux/riscv64 riscv64/ubuntu:noble-20250404

# Install dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    busybox-static=1:1.36.1-6ubuntu3.1

# Install guest tools
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.1
ADD https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb /tmp/
RUN dpkg -i /tmp/machine-guest-tools_riscv64.deb

# Strip non-determinism
RUN rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/*

# Give permission for dapp user to access /dev/pmem1
RUN mkdir -p /etc/cartesi-init.d && \
    echo "chown dapp:dapp /dev/pmem1" > /etc/cartesi-init.d/dapp-state && \
    chmod 755 /etc/cartesi-init.d/dapp-state

# Install honeypot
WORKDIR /home/dapp
COPY --from=builder /home/dapp/honeypot .
