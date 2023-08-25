# syntax=docker.io/docker/dockerfile:1.4
FROM --platform=linux/riscv64 riscv64/ubuntu:22.04 as builder
ENV SOURCE_DATE_EPOCH=1692902406
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends \
    build-essential=12.9ubuntu3 \
    clang-tidy=1:14.0-55~exp2
rm -rf /var/lib/apt/lists/*
EOF

ARG NETWORK=localhost

ADD https://github.com/cartesi/image-kernel/releases/download/v0.16.0/linux-headers-5.15.63-ctsi-2.tar.xz /
RUN tar -xf linux-headers-5.15.63-ctsi-2.tar.xz
WORKDIR /home/dapp
COPY . .
RUN make lint
RUN make



FROM --platform=linux/riscv64 riscv64/ubuntu:22.04 as dapp

WORKDIR /home/dapp
COPY --from=builder /home/dapp/honeypot .
