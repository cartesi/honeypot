local cartesi = require("cartesi")
local consts = require("honeypot-consts")
require("testlib.machine-ext")
local encoder = require("testlib.encoder")
local lester = require("third-party.lester")
local describe, it, expect = lester.describe, lester.it, lester.expect

local ERC20_ALICE_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
local MACHINE_STORED_DIR = "../snapshot"
local MACHINE_RUNTIME_CONFIG = { skip_root_hash_check = true }

describe("honeypot basic", function()
    local machine <close> = cartesi.machine(MACHINE_STORED_DIR, MACHINE_RUNTIME_CONFIG)

    it("should accept first deposit", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 1,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        expect.equal(res, expected_res)
    end)

    it("should accept second deposit", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 2,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        expect.equal(res, expected_res)
    end)

    it("should accept third deposit with 0 amount", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 0,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore deposit with invalid token address", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = ERC20_ALICE_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 3,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_DEPOSIT_INVALID_TOKEN },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore deposit with invalid sender address", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = ERC20_ALICE_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 3,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore deposit with invalid payload length", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 2,
                extra_data = "\x00",
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should accept balance inspect", function()
        local res = machine:inspect_state()
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { encoder.encode_be256(3) },
        }
        expect.equal(res, expected_res)
    end)

    it("should accept balance inspect with any kind of data", function()
        local res = machine:inspect_state("SOME RANDOM DATA")
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { encoder.encode_be256(3) },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore withdraw with invalid payload length", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_WITHDRAWAL_ADDRESS,
            payload = "\x00",
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should accept withdraw when there is funds", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_WITHDRAWAL_ADDRESS,
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            outputs = {
                encoder.encode_voucher_output({
                    address = consts.ERC20_TOKEN_ADDRESS,
                    value = 0,
                    payload = encoder.encode_erc20_transfer({
                        address = consts.ERC20_WITHDRAWAL_ADDRESS,
                        amount = 3,
                    }),
                }),
            },
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore withdraw when there is no funds", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_WITHDRAWAL_ADDRESS,
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_WITHDRAW_NO_FUNDS },
        }
        expect.equal(res, expected_res)
    end)

    it("should accept inspect when there is no funds", function()
        local res = machine:inspect_state()
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { encoder.encode_be256(0) },
        }
        expect.equal(res, expected_res)
    end)
end)

describe("honeypot edge", function()
    local machine <close> = cartesi.machine(MACHINE_STORED_DIR, MACHINE_RUNTIME_CONFIG)

    it("should ignore empty input", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = "",
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore incomplete deposit input", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_address(consts.ERC20_TOKEN_ADDRESS)
                .. encoder.encode_erc20_address(ERC20_ALICE_ADDRESS),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore deposit of an addition overflow", function()
        local overflow_machine <close> = cartesi.machine(MACHINE_STORED_DIR, MACHINE_RUNTIME_CONFIG)

        local res = overflow_machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_SUCCESS },
        }
        expect.equal(res, expected_res)

        res = overflow_machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 1,
            }),
        }))
        expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_DEPOSIT_BALANCE_OVERFLOW },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore input chain id out of supported range", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            chain_id = "0x10000000000000000",
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 1,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore input block number out of supported range", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            block_number = "0x10000000000000000",
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 1,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore input block timestamp out of supported range", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            block_timestamp = "0x10000000000000000",
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 1,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore input index out of supported range", function()
        local res = machine:advance_state(encoder.encode_advance_input({
            msg_sender = consts.ERC20_PORTAL_ADDRESS,
            index = "0x10000000000000000",
            payload = encoder.encode_erc20_deposit({
                contract_address = consts.ERC20_TOKEN_ADDRESS,
                sender_address = ERC20_ALICE_ADDRESS,
                amount = 1,
            }),
        }))
        local expected_res = {
            break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
            yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
            reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
        }
        expect.equal(res, expected_res)
    end)

    it("should ignore input with invalid payload offset", function()
        local payload = encoder.encode_erc20_deposit({
            contract_address = consts.ERC20_TOKEN_ADDRESS,
            sender_address = ERC20_ALICE_ADDRESS,
            amount = 1,
        })
        do
            local res = machine:advance_state(encoder.encode_advance_input({
                msg_sender = consts.ERC20_PORTAL_ADDRESS,
                payload = payload,
                payload_offset = 0x100 + 32,
            }))
            local expected_res = {
                break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
                yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
                reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
            }
            expect.equal(res, expected_res)
        end
    end)

    it("should ignore input with invalid payload length", function()
        local payload = encoder.encode_erc20_deposit({
            contract_address = consts.ERC20_TOKEN_ADDRESS,
            sender_address = ERC20_ALICE_ADDRESS,
            amount = 1,
        })
        do
            local res = machine:advance_state(encoder.encode_advance_input({
                msg_sender = consts.ERC20_PORTAL_ADDRESS,
                payload = payload,
                payload_length = #payload + 13,
            }))
            local expected_res = {
                break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
                yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
                reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
            }
            expect.equal(res, expected_res)
        end
        do
            local res = machine:advance_state(encoder.encode_advance_input({
                msg_sender = consts.ERC20_PORTAL_ADDRESS,
                payload = payload,
                payload_length = #payload + 1,
            }))
            local expected_res = {
                break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
                yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
                reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
            }
            expect.equal(res, expected_res)
        end
        do
            local res = machine:advance_state(encoder.encode_advance_input({
                msg_sender = consts.ERC20_PORTAL_ADDRESS,
                payload = payload,
                payload_length = #payload - 1,
            }))
            local expected_res = {
                break_reason = cartesi.BREAK_REASON_YIELDED_MANUALLY,
                yield_reason = cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED,
                reports = { consts.ADVANCE_STATUS_INVALID_REQUEST },
            }
            expect.equal(res, expected_res)
        end
    end)
end)
