local encoder = {}

-- Encode a value into a n-bit big-endian value.
function encoder.encode_be(bits, v, trim)
    assert(bits % 8 == 0, "bits must be a multiple of 8")
    local bytes = bits // 8
    local res
    if type(v) == "string" and v:find("^0[xX][0-9a-fA-F]+$") then
        res = v:sub(3):gsub("%x%x", function(bytehex) return string.char(tonumber(bytehex, 16)) end)
    elseif math.type(v) == "integer" then
        res = string.pack(">I8", v):gsub("^\x00+", "")
    else
        error("cannot encode value '" .. tostring(v) .. "' to " .. bits .. " bit big endian")
    end
    if #res < bytes then -- add padding
        res = string.rep("\x00", bytes - #res) .. res
    elseif #res > bytes then
        error("value is too large to be encoded into " .. bits .. " bit big endian")
    end
    if trim then
        res = res:gsub("^\x00+", "")
        if res == "" then res = "\x00" end
    end
    return res
end

function encoder.encode_be256(v)
    if math.type(v) == "integer" then
        return string.pack(">I16I16", 0, v)
    elseif type(v) == "string" and #v == 32 then
        return v
    else
        return encoder.encode_be(256, v)
    end
end

function encoder.encode_erc20_address(v)
    if type(v) == "string" and #v == 20 then
        return v
    else -- numeric or hexadecimal encoding
        return encoder.encode_be(160, v)
    end
end

function encoder.encode_erc20_deposit(deposit)
    return encoder.encode_erc20_address(deposit.contract_address) -- 20 bytes
        .. encoder.encode_erc20_address(deposit.sender_address) -- 20 bytes
        .. encoder.encode_be256(deposit.amount) -- 32 bytes
        .. (deposit.extra_data or "")
end

function encoder.encode_erc20_transfer(transfer)
    return "\169\5\156\187" -- First 4 bytes of "transfer(address,uint256)".
        .. string.rep("\x00", 12) -- 12 bytes of padding zeros
        .. encoder.encode_erc20_address(transfer.address) -- 20 bytes
        .. encoder.encode_be256(transfer.amount) -- 32 bytes
end

local EVM_ADVANCE <const> = "\x41\x5b\xf3\x63"
local VOUCHER <const> = "\x23\x7a\x81\x6f"
local ERC20_12PADS = string.rep("\x00", 12)

function encoder.encode_advance_input(input)
    local payload_offset = input.payload_offset or 0x100
    local payload_data = input.payload or ""
    local payload_length = input.payload_length or #payload_data
    local payload_padding = string.rep("\x00", (32 - payload_length) % 32)
    return table.concat({
        EVM_ADVANCE,
        encoder.encode_be256(input.chain_id or 0),
        ERC20_12PADS,
        encoder.encode_erc20_address(input.app_contract or 0),
        ERC20_12PADS,
        encoder.encode_erc20_address(input.msg_sender or 0),
        encoder.encode_be256(input.block_number or 0),
        encoder.encode_be256(input.block_timestamp or 0),
        encoder.encode_be256(input.prev_randao or 0),
        encoder.encode_be256(input.index or 0),
        encoder.encode_be256(payload_offset),
        encoder.encode_be256(payload_length),
        payload_data,
        payload_padding,
    })
end

function encoder.encode_voucher_output(output)
    local payload_offset = 0x60
    local payload_data = output.payload or ""
    local payload_length = #payload_data
    local payload_padding = string.rep("\x00", (32 - payload_length) % 32)
    return table.concat({
        VOUCHER,
        ERC20_12PADS,
        encoder.encode_erc20_address(output.address or 0),
        encoder.encode_be256(output.value or 0),
        encoder.encode_be256(payload_offset),
        encoder.encode_be256(payload_length),
        payload_data,
        payload_padding,
    })
end

return encoder
