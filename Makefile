# (c) Cartesi and individual authors (see https://github.com/cartesi/honeypot/blob/main/AUTHORS)
# SPDX-License-Identifier: Apache-2.0 (see https://github.com/cartesi/honeypot/blob/main/LICENSE)
# Copyright Cartesi Pte. Ltd.

CXX  := g++

CXXFLAGS := \
	-std=c++17 \
	-O1 \
	-fno-exceptions \
	-fno-rtti \
	-fno-strict-aliasing \
	-fno-strict-overflow \
	-fstack-protector-strong \
	-D_FORTIFY_SOURCE=2 \
	-D_GLIBCXX_ASSERTIONS \
	-Wall \
	-Wextra \
	-Werror \
	-Wformat -Werror=format-security
INCS := -Iconfig/$(NETWORK) -I/opt/riscv/kernel/work/linux-headers/include
LDFLAGS := -Wl,-O1,--sort-common,-z,relro,-z,now,--as-needed


.PHONY: clean

honeypot: honeypot.cpp
	$(CXX) $(CXXFLAGS) $(INCS) $(LDFLAGS) -o $@ $^

lint: honeypot.cpp
	clang-tidy honeypot.cpp -- $(CXXFLAGS) $(INCS)

clean:
	@rm -rf honeypot
