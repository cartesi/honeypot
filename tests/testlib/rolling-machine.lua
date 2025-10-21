local cartesi = require("cartesi")
local jsonrpc = require("cartesi.jsonrpc")

local machine_methods = getmetatable(cartesi.machine).__index

function machine_methods:run_until_yield_or_halt()
    local outputs, reports, progresses
    while true do
        local break_reason = self:run()
        if break_reason == cartesi.BREAK_REASON_HALTED then
            return { break_reason = break_reason, outputs = outputs, reports = reports }
        elseif break_reason == cartesi.BREAK_REASON_YIELDED_MANUALLY then
            local _, yield_reason, outputs_hash = self:receive_cmio_request()
            return { break_reason = break_reason, yield_reason = yield_reason, outputs = outputs, reports = reports },
                outputs_hash
        elseif break_reason == cartesi.BREAK_REASON_YIELDED_AUTOMATICALLY then
            local _, yield_reason, data = self:receive_cmio_request()
            if yield_reason == cartesi.CMIO_YIELD_AUTOMATIC_REASON_TX_OUTPUT then
                outputs = outputs or {}
                table.insert(outputs, data)
            elseif yield_reason == cartesi.CMIO_YIELD_AUTOMATIC_REASON_TX_REPORT then
                reports = reports or {}
                table.insert(reports, data)
            elseif yield_reason == cartesi.CMIO_YIELD_AUTOMATIC_REASON_PROGRESS then
                progresses = progresses or {}
                table.insert(progresses, data)
            else
                error("unexpected yield reason")
            end
        else
            error("unexpected break reason")
        end
    end
end

function machine_methods:advance_state(input)
    local forked <close> = self:fork_server():set_cleanup_call(jsonrpc.SHUTDOWN)
    self:send_cmio_response(cartesi.CMIO_YIELD_REASON_ADVANCE_STATE, input or "")
    local res = self:run_until_yield_or_halt()
    if res.yield_reason ~= cartesi.CMIO_YIELD_MANUAL_REASON_RX_ACCEPTED then self:swap(forked) end
    return res
end

function machine_methods:inspect_state(query)
    local forked <close> = self:fork_server():set_cleanup_call(jsonrpc.SHUTDOWN)
    forked:send_cmio_response(cartesi.CMIO_YIELD_REASON_INSPECT_STATE, query or "")
    return forked:run_until_yield_or_halt()
end

local function load_rolling_machine(...) return jsonrpc.spawn_server():set_cleanup_call(jsonrpc.SHUTDOWN):load(...) end

return load_rolling_machine
