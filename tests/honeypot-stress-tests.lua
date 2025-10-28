local cartesi = require("cartesi")
local load_rolling_machine = require("testlib.rolling-machine")
local consts = require("honeypot-consts")
local encoder = require("testlib.encoder")
local lester = require("third-party.lester")
local bint256 = require("third-party.bint")(256)
local describe, it, expect = lester.describe, lester.it, lester.expect

local MACHINE_STORED_DIR = "../snapshot"
local MACHINE_RUNTIME_CONFIG = {
    htif = { no_console_putchar = true },
    skip_root_hash_check = true,
}

local CHANCE_WITHDRAW = 1 / 100
local CHANCE_DEPOSIT_OVERFLOW = 1 / 100
local CHANCE_INVALID_TOKEN = 1 / 20
local CHANCE_EXTRA_DATA = 1 / 20

-- Returns a random ERC-20 address.
local function random_erc20_address()
    return string.pack(">I4I8I8", math.random(0) >> 32, math.random(0), math.random(0), math.random(0))
end

-- Returns valid_address or a random ERC-20 address.
local function random_invalid_erc20_address(invalid_chance, valid_address)
    local valid = math.random() >= invalid_chance
    return valid and valid_address or random_erc20_address(), valid
end

-- Returns a random amount between 0 and UINT64_MAX (18446744073709551615).
local function random_amount(overflow_chance, balance)
    local amount = bint256.fromuinteger(math.random(0))
    local overflow = false
    if balance > 0 and math.random() < overflow_chance then
        local amount_to_overflow = (bint256(-1) - balance) + 1
        amount = amount_to_overflow + amount
        if bint256.ult(amount, amount_to_overflow) then amount = amount_to_overflow end
        overflow = true
    end
    return amount, overflow
end

-- Returns a random string of length between 0 and max_len.
local function random_string(non_empty_chance, max_len)
    return math.random() < non_empty_chance and string.rep(string.char(math.random(0, 255)), math.random(1, max_len))
        or ""
end

-- Performs a random withdraw request and returns the new balance.
local function random_withdraw_request(machine, balance)
    -- Generate random withdraw request
    local extra_data = random_string(CHANCE_EXTRA_DATA, 32)
    -- Compute expected response
    local expected_res
    if #extra_data ~= 0 then -- Invalid message
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_REJECTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
    elseif bint256.eq(balance, 0) then -- No funds
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_REJECTED,
            reports = { consts.ADVANCE_STATUS_WITHDRAW_NO_FUNDS },
        }
    else -- Success
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            outputs = {
                encoder.encode_voucher_output({
                    address = consts.ERC20_TOKEN_ADDRESS_ENCODED,
                    value = 0,
                    payload = encoder.encode_erc20_transfer({
                        address = consts.ERC20_WITHDRAWAL_ADDRESS_ENCODED,
                        amount = balance:tobe(),
                    }),
                }),
            },
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        balance = bint256(0)
    end
    -- Make the advance request
    local res = machine:advance_state(encoder.encode_advance_input({
        msg_sender = consts.ERC20_WITHDRAWAL_ADDRESS_ENCODED,
        payload = extra_data,
    }))
    -- Check request
    expect.equal(res, expected_res)
    return balance
end

-- Performs a random deposit request and returns the new balance.
local function random_deposit_request(machine, balance)
    -- Generate a random deposit request
    local token_address, valid_contract =
        random_invalid_erc20_address(CHANCE_INVALID_TOKEN, consts.ERC20_TOKEN_ADDRESS_ENCODED)
    local sender = random_erc20_address()
    local amount, overflow = random_amount(CHANCE_DEPOSIT_OVERFLOW, balance)
    local extra_data = random_string(CHANCE_EXTRA_DATA, 32)
    -- Compute expected response
    local expected_res
    if #extra_data ~= 0 then -- Invalid message
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_REJECTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
    elseif not valid_contract then -- Invalid token address
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_REJECTED,
            reports = { consts.ADVANCE_STATUS_DEPOSIT_INVALID_TOKEN },
        }
    elseif overflow then -- Balance overflow
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_REJECTED,
            reports = { consts.ADVANCE_STATUS_DEPOSIT_BALANCE_OVERFLOW },
        }
    else -- Success
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        balance = balance + amount
    end
    if expected_res.yield_reason == cartesi.CMIO_YIELD_MANUAL_REASON_RX_REJECTED then return balance end
    -- Make the advance request
    local res = machine:advance_state(encoder.encode_advance_input({
        msg_sender = consts.ERC20_PORTAL_ADDRESS_ENCODED,
        payload = encoder.encode_erc20_deposit({
            contract_address = token_address,
            sender_address = sender,
            amount = amount:tobe(),
            extra_data = extra_data,
        }),
    }))
    -- Check expected advance state results
    expect.equal(res, expected_res)
    return balance
end

-- Performs a random advance state request and returns the new balance.
local function random_advance_state(machine, balance)
    if math.random() < CHANCE_WITHDRAW then -- withdraw
        balance = random_withdraw_request(machine, balance)
    else -- deposit
        balance = random_deposit_request(machine, balance)
    end
    return balance
end

-- Performs a inspect state request and check if its correct.
local function inspect_balance_check(machine, balance)
    local expected_res = {
        break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
        yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
        reports = { balance:tobe() },
    }
    local res = machine:inspect_state(random_string(CHANCE_EXTRA_DATA, 32))
    expect.equal(res, expected_res)
end

local function perform_tests(num_iterations)
    local machine <close> = load_rolling_machine(MACHINE_STORED_DIR, MACHINE_RUNTIME_CONFIG)
    local balance = bint256(0)
    local num_iterations1 = num_iterations // 10
    local num_iterations2 = num_iterations - num_iterations1

    -- Make tests reproducible
    math.randomseed(0)

    describe("honeypot stress", function()
        it("random advance state and inspect state (" .. num_iterations1 .. " iterations)", function()
            for _ = 1, num_iterations1 do
                balance = random_advance_state(machine, balance)
                inspect_balance_check(machine, balance)
            end
        end)

        it("random advance state (" .. num_iterations2 .. " iterations)", function()
            local start = lester.seconds()
            for _ = 1, num_iterations2 do
                balance = random_advance_state(machine, balance)
            end
            local elapsed = lester.seconds() - start
            print(string.format("%.2f req/s", num_iterations2 / elapsed))
            inspect_balance_check(machine, balance)
        end)
    end)
end

perform_tests(1000)

print("Running tests for 10000 requests, this should take a few minutes...")
perform_tests(10000)
