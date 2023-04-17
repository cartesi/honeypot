# syntax=docker.io/docker/dockerfile:1.4
# The rootfs image MUST be built with support to boost
FROM cartesi/rootfs:0.15.0 as dapp-build
ARG NETWORK=localhost

WORKDIR /opt/cartesi/dapp
COPY . .

RUN wget https://sourceforge.net/projects/boost/files/boost/1.73.0/boost_1_73_0.zip
RUN unzip -u boost_1_73_0.zip

RUN make NETWORK=$NETWORK
