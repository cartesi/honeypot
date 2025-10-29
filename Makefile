# C++ compiler
CXX = gcc

# C++ warning flags
WARN_CXXFLAGS = -Wall -Wextra -Wpedantic -Wformat -Werror=format-security -Wno-missing-field-initializers

# C++ optimization flags, use -O1 to be safe of GCC compiler optimizer bugs
OPT_CXXFLAGS = -O1

# C++ flags to improve safety
HARDEN_CXXFLAGS = -fno-strict-aliasing -fno-strict-overflow -fhardened -Wno-hardened

# Use C++23, without exceptions and RTTI to have minimal overhead and predictable behavior
CXXFLAGS += \
	$(OPT_CXXFLAGS) \
	-std=c++23 \
	-fno-exceptions \
	-fno-rtti \
	$(WARN_CXXFLAGS)

# Use libcmt for CMIO device control
LIBS = -l:libcmt.a

# Linker flags to make binary deterministic
LDFLAGS += -Wl,--build-id=none

# Linux image
LINUX_KERNEL_VER = 6.5.13-ctsi-1
LINUX_IMAGE_VER = 0.20.0
LINUX_IMAGE_SHA256SUM = 65dd100ff6204346ac2f50f772721358b5c1451450ceb39a154542ee27b4c947

# Machine entrypoint
MACHINE_ENTRYPOINT = exec /home/dapp/honeypot

# Machine initial kernel and flash drives
MACHINE_FLAGS = \
	--ram-length=48Mi \
	--ram-image=linux.bin \
	--append-bootargs=ro \
	--flash-drive=label:root,filename:rootfs.ext2 \
	--flash-drive=label:state,length:4096,user:dapp

HONEYPOT_CONFIG = localhost

# Current architecture
ARCH := $(shell uname -m)

INCS += -I./config/${HONEYPOT_CONFIG}
ifneq ($(ARCH),riscv64)
# For linting in the host
LINTER_INCS += -I./libcmt/include
endif

HEADERS = config/$(HONEYPOT_CONFIG)/honeypot-config.hpp
SOURCES = honeypot.cpp

ifeq ($(ARCH),riscv64)
all: honeypot ## Build honeypot binary when inside RISC-V environment, otherwise honeypot machine snapshot
else
all: snapshot
endif

honeypot: $(SOURCES) $(HEADERS) ## Build honeypot binary
	$(CXX) $(CXXFLAGS) $(HARDEN_CXXFLAGS) $(INCS) -o $@ $< $(LDFLAGS) $(LIBS)

snapshot: rootfs.ext2 linux.bin ## Generate cartesi machine genesis snapshot
	rm -rf snapshot
	cartesi-machine $(MACHINE_FLAGS) --assert-rolling-template --final-hash --store=$@ -- $(MACHINE_ENTRYPOINT)

rootfs.ext2: rootfs.tar ## Generate cartesi machine rootfs EXT2 filesystem
	xgenext2fs --block-size 4096 --faketime --readjustment +0 --tarball $< $@

rootfs.tar: rootfs.Dockerfile $(SOURCES) $(HEADERS) ## Generate cartesi machine rootfs filesystem using Docker
	docker buildx build --progress plain --output type=tar,dest=$@ --file rootfs.Dockerfile --build-arg HONEYPOT_CONFIG=${HONEYPOT_CONFIG} .

linux.bin: ## Download cartesi machine Linux kernel
	wget -O linux.bin https://github.com/cartesi/machine-linux-image/releases/download/v$(LINUX_IMAGE_VER)/linux-$(LINUX_KERNEL_VER)-v$(LINUX_IMAGE_VER).bin
	echo "$(LINUX_IMAGE_SHA256SUM) linux.bin" | sha256sum -c

shell: rootfs.ext2 linux.bin ## Spawn a cartesi machine guest shell for debugging
	cartesi-machine $(MACHINE_FLAGS) -u=root -i -- exec /bin/busybox ash

lint: lint-cpp lint-lua ## Lint C++ and Lua code

lint-cpp: $(SOURCES) $(HEADERS) ## Lint C++ code
	clang-tidy $^ -- $(CXXFLAGS) $(INCS) $(LINTER_INCS)

lint-lua: ## Lint Lua code
	luacheck .

format: format-cpp format-lua ## Format C++ and Lua code

format-cpp: $(SOURCES) ## Format C++ code
	clang-format -i $^

format-lua: ## Format Lua code
	stylua --indent-type Spaces --collapse-simple-statement Always \
		tests/*.lua \
		tests/testlib/*.lua

test: snapshot ## Run tests
	cd tests && HONEYPOT_CONFIG=${HONEYPOT_CONFIG} lua5.4 honeypot-tests.lua

test-stress: snapshot ## Run stress tests
	cd tests && HONEYPOT_CONFIG=${HONEYPOT_CONFIG} lua5.4 honeypot-stress-tests.lua

clean: ## Clean generated files
	rm -rf snapshot rootfs.ext2 rootfs.tar honeypot

distclean: clean ## Clean generated and downloaded files
	rm -rf linux.bin

help: ## Show this help
	@sed \
		-e '/^[a-zA-Z0-9_\-]*:.*##/!d' \
		-e 's/:.*##\s*/:/' \
		-e 's/^\(.\+\):\(.*\)/$(shell tput setaf 6)\1$(shell tput sgr0):\2/' \
		$(MAKEFILE_LIST) | column -c2 -t -s :

.PHONY: all shell lint lint-cpp lint-lua format format-cpp format-lua test test-stress clean distclean help
