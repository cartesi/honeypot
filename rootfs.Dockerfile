ARG UBUNTU_TAG=noble-20251001
ARG UBUNTU_DIGEST=sha256:66460d557b25769b102175144d538d88219c077c678a49af4afca6fbfc1b5252
ARG APT_UPDATE_SNAPSHOT=20251022T030400Z
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.2
ARG MACHINE_GUEST_TOOLS_SHA256SUM=c077573dbcf0cdc146adf14b480bfe454ca63aa4d3e8408c5487f550a5b77a41
ARG DEBIAN_FRONTEND=noninteractive

################################
# base
FROM --platform=linux/riscv64 docker.io/library/ubuntu:${UBUNTU_TAG}@${UBUNTU_DIGEST} AS base

ARG APT_UPDATE_SNAPSHOT
ARG DEBIAN_FRONTEND
RUN <<EOF
set -eu
apt-get update
apt-get install -y --no-install-recommends ca-certificates
apt-get update --snapshot=${APT_UPDATE_SNAPSHOT}
apt-get install -y --no-install-recommends busybox-static
apt-get remove -y --purge ca-certificates
apt-get autoremove -y --purge
EOF

# Install guest tools
ARG MACHINE_GUEST_TOOLS_VERSION
ARG MACHINE_GUEST_TOOLS_SHA256SUM
ADD --checksum=sha256:${MACHINE_GUEST_TOOLS_SHA256SUM} \
  https://github.com/cartesi/machine-guest-tools/releases/download/v${MACHINE_GUEST_TOOLS_VERSION}/machine-guest-tools_riscv64.deb \
  /tmp/
RUN dpkg -i /tmp/machine-guest-tools_riscv64.deb && \
    rm /tmp/machine-guest-tools_riscv64.deb

################################
# dapp builder
FROM base AS dapp-builder

# Install build essential
ARG DEBIAN_FRONTEND
RUN apt-get install -y --no-install-recommends \
    make g++-14

# Compile
WORKDIR /home/dapp
COPY Makefile .
COPY honeypot.cpp .
COPY config config
ENV SOURCE_DATE_EPOCH=0
ARG HONEYPOT_CONFIG=localhost
RUN make HONEYPOT_CONFIG=${HONEYPOT_CONFIG} CXX=g++-14

################################
# rootfs builder
FROM base AS rootfs-builder

# Create a distroless rootfs with only the necessary files
WORKDIR /rootfs
RUN <<EOF
set -eu

# Create filesystem tree
mkdir -p dev etc home mnt proc run sys tmp var usr/bin usr/sbin usr/lib bin.usr-is-merged
ln -s usr/bin usr/sbin usr/lib .
ln -s /run var/run

# Install system libraries
mkdir -p usr/lib/riscv64-linux-gnu
cp -a /usr/lib/riscv64-linux-gnu/ld-linux-riscv64-lp64d.so.1 /usr/lib/riscv64-linux-gnu/libc.so.6 usr/lib/riscv64-linux-gnu/
ln -s riscv64-linux-gnu/ld-linux-riscv64-lp64d.so.1 usr/lib/

# Install busybox
cp -a /usr/bin/busybox usr/bin/
/usr/bin/busybox --list-long | grep -v -e busybox -e linuxrc -e init | xargs -I{} ln -s /bin/busybox {}

# Install init system
cp -a /usr/sbin/cartesi-init /usr/sbin/xhalt usr/sbin/

# Create essential users
ln -s /bin/busybox /usr/bin/ash
mkdir /empty-skel
groupadd --prefix=/rootfs --gid 0 --system root
useradd --prefix=/rootfs --create-home --shell=/usr/bin/ash --uid 0 --gid 0 --home-dir /root --skel=/empty-skel --no-log-init --system root
useradd --prefix=/rootfs --create-home --shell=/usr/bin/ash --uid 1000 --user-group --home-dir /home/dapp --skel=/empty-skel --no-log-init dapp
EOF

# Install dapp
COPY --from=dapp-builder /home/dapp/honeypot home/dapp/

################################
# rootfs
FROM scratch

# Install honeypot
COPY --from=rootfs-builder /rootfs /
