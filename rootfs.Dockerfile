################################
# honeypot builder
FROM --platform=linux/riscv64 alpine:3.21.3 AS builder

# Install build essential
RUN apk add alpine-sdk

# Install guest tools and libcmt
ADD --chmod=644 https://edubart.github.io/linux-packages/apk/keys/cartesi-apk-key.rsa.pub /etc/apk/keys/cartesi-apk-key.rsa.pub
RUN echo "https://edubart.github.io/linux-packages/apk/stable" >> /etc/apk/repositories
RUN apk update && \
    apk add cartesi-machine-guest-tools=0.17.0-r1 && \
    apk add cartesi-machine-guest-libcmt-dev=0.17.0-r1

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
FROM --platform=linux/riscv64 alpine:3.21.3

# Install guest tools
RUN adduser -D dapp dapp 2>/dev/null
COPY --from=builder /usr/sbin/cartesi-init /usr/sbin/cartesi-init
COPY --from=builder /usr/sbin/xhalt /usr/sbin/xhalt

# Remove unneeded packages to shrink image
RUN apk del --purge apk-tools alpine-release alpine-keys ca-certificates-bundle libc-utils && rm -rf /var/cache/apk /etc/apk /lib/apk

# Give permission for dapp user to access /dev/pmem1
RUN mkdir -p /etc/cartesi-init.d && \
    echo "chown dapp:dapp /dev/pmem1" > /etc/cartesi-init.d/dapp-state && \
    chmod 755 /etc/cartesi-init.d/dapp-state

# Install honeypot
WORKDIR /home/dapp
COPY --from=builder /home/dapp/honeypot .
