local consts = {
    ADVANCE_STATUS_SUCCESS = string.char(0),
    ADVANCE_STATUS_INVALID_REQUEST = string.char(1),
    ADVANCE_STATUS_DEPOSIT_INVALID_TOKEN = string.char(2),
    ADVANCE_STATUS_DEPOSIT_BALANCE_OVERFLOW = string.char(3),
    ADVANCE_STATUS_WITHDRAW_NO_FUNDS = string.char(4),
    ADVANCE_STATUS_WITHDRAW_VOUCHER_FAILED = string.char(5),
}

do -- read addresses from C++ config file
    local config_filename = "../config/" .. os.getenv("HONEYPOT_CONFIG") .. "/honeypot-config.hpp"
    local config_file <close> = assert(io.open(config_filename), "invalid honeypot config")
    local config_contents = assert(config_file:read("a"))
    local function parse_config_erc20_address(name)
        return (config_contents:match(name .. "%s+{([^}]*)}"):gsub(",0x", ""))
    end
    consts.ERC20_PORTAL_ADDRESS = parse_config_erc20_address("CONFIG_ERC20_PORTAL_ADDRESS")
    consts.ERC20_WITHDRAWAL_ADDRESS = parse_config_erc20_address("CONFIG_ERC20_WITHDRAWAL_ADDRESS")
    consts.ERC20_TOKEN_ADDRESS = parse_config_erc20_address("CONFIG_ERC20_TOKEN_ADDRESS")
end

local encoder = require("testlib.encoder")
consts.ERC20_PORTAL_ADDRESS_ENCODED = encoder.encode_erc20_address(consts.ERC20_PORTAL_ADDRESS)
consts.ERC20_WITHDRAWAL_ADDRESS_ENCODED = encoder.encode_erc20_address(consts.ERC20_WITHDRAWAL_ADDRESS)
consts.ERC20_TOKEN_ADDRESS_ENCODED = encoder.encode_erc20_address(consts.ERC20_TOKEN_ADDRESS)

return consts
