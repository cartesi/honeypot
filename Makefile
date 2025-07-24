# C++ compiler
CXX = gcc

# C++ warning flags
WARN_CXXFLAGS = -Wall -Wextra -Wpedantic -Wformat -Werror=format-security -Wno-missing-field-initializers

# C++ optimization flags, use -O1 to be safe of GCC compiler optimizer bugs
OPT_CXXFLAGS = -O1

# C++ flags to improve safety
HARDEN_CXXFLAGS = \
	-D_FORTIFY_SOURCE=3 \
	-D_GLIBCXX_ASSERTIONS \
	-ftrivial-auto-var-init=zero \
	-fstack-protector-strong \
	-fstack-clash-protection \
	-fno-strict-aliasing \
	-fno-strict-overflow \
	-fPIE

# Use C++20, without exceptions and RTTI to have minimal overhead and predictable behavior
CXXFLAGS += \
	-std=c++20 \
	-fno-exceptions \
	-fno-rtti \
	$(WARN_CXXFLAGS) \
	$(OPT_CXXFLAGS)

# Use libcmt for CMIO device control
LIBS = -l:libcmt.a

# Linker flags to improve safety
HARDEN_LDFLAGS = \
	-pie \
	-Wl,-z,relro \
	-Wl,-z,now
LDFLAGS += -Wl,--build-id=none $(HARDEN_LDFLAGS)

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

snapshot: rootfs.Dockerfile $(SOURCES) $(HEADERS) ## Generate cartesi machine genesis snapshot
	cartesi-dev build -c cartesi.toml -c cartesi.${HONEYPOT_CONFIG}.toml

shell: snapshot ## Spawn a cartesi machine guest shell for debugging
	cartesi-dev shell

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
	pnpm i
	pnpm run test

test-stress: snapshot ## Run stress tests
	cd tests && HONEYPOT_CONFIG=${HONEYPOT_CONFIG} lua5.4 honeypot-stress-tests.lua

clean: ## Clean generated files
	cartesi-dev clean
	rm -rf honeypot

help: ## Show this help
	@sed \
		-e '/^[a-zA-Z0-9_\-]*:.*##/!d' \
		-e 's/:.*##\s*/:/' \
		-e 's/^\(.\+\):\(.*\)/$(shell tput setaf 6)\1$(shell tput sgr0):\2/' \
		$(MAKEFILE_LIST) | column -c2 -t -s :

.PHONY: all shell lint lint-cpp lint-lua format format-cpp format-lua test test-stress clean help
