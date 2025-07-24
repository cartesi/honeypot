import { rollups } from "@tuler/node-cartesi-machine";
import { bytesToHex, getAddress, hexToBigInt, slice } from "viem";
import { afterAll, describe, expect, it } from "vitest";
import {
  encodeAdvanceInput,
  encodeErc20Deposit,
  encodeErc20Transfer,
  encodeVoucherOutput,
} from "./encoder";

const ERC20_TOKEN_ADDRESS = getAddress(
  "0x491604c0fdf08347dd1fa4ee062a822a5dd06b5d"
);
const ERC20_ALICE_ADDRESS =
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const ERC20_PORTAL_ADDRESS =
  "0xc700D6aDd016eECd59d989C028214Eaa0fCC0051" as const;
const ERC20_WITHDRAWAL_ADDRESS =
  "0x60247492F1538Ed4520e61aE41ca2A8447592Ff5" as const;
const MACHINE_STORED_DIR = ".cartesi/image";
const MACHINE_RUNTIME_CONFIG = { skip_root_hash_check: true };

enum ReportStatus {
  ADVANCE_STATUS_SUCCESS = "0x00",
  ADVANCE_STATUS_INVALID_REQUEST = "0x01",
  ADVANCE_STATUS_DEPOSIT_INVALID_TOKEN = "0x02",
  ADVANCE_STATUS_DEPOSIT_BALANCE_OVERFLOW = "0x03",
  ADVANCE_STATUS_WITHDRAW_NO_FUNDS = "0x04",
  ADVANCE_STATUS_WITHDRAW_VOUCHER_FAILED = "0x05",
}

describe("honeypot basic", () => {
  const machine = rollups(MACHINE_STORED_DIR, {
    runtimeConfig: MACHINE_RUNTIME_CONFIG,
  });
  it("should accept first deposit", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 1n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(ReportStatus.ADVANCE_STATUS_SUCCESS);
  });

  it("should accept second deposit", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 2n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(ReportStatus.ADVANCE_STATUS_SUCCESS);
  });

  it("should accept third deposit with 0 amount", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 0n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(ReportStatus.ADVANCE_STATUS_SUCCESS);
  });

  it("should ignore deposit with invalid token address", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_ALICE_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 3n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_DEPOSIT_INVALID_TOKEN
    );
  });

  it("should ignore deposit with invalid sender address", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_ALICE_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 3n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore deposit with invalid payload length", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 2n,
          execLayerData: "0x00",
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should accept balance inspect", () => {
    const reports = machine.inspect(Buffer.alloc(0), { collect: true });
    expect(reports.length).toBe(1);
    expect(hexToBigInt(bytesToHex(reports[0]))).toBe(3n);
  });

  it("should accept balance inspect with any kind of data", () => {
    const reports = machine.inspect(Buffer.from("SOME RANDOM DATA"), {
      collect: true,
    });
    expect(reports.length).toBe(1);
    expect(hexToBigInt(bytesToHex(reports[0]))).toBe(3n);
  });

  it("should ignore withdraw with invalid payload length", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_WITHDRAWAL_ADDRESS,
        payload: "0x00",
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should accept withdraw when there is funds", () => {
    const { reports, outputs } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_WITHDRAWAL_ADDRESS,
      }),
      { collect: true }
    );
    expect(outputs.length).toBe(1);
    expect(bytesToHex(outputs[0])).toBe(
      encodeVoucherOutput({
        destination: ERC20_TOKEN_ADDRESS,
        value: 0n,
        payload: encodeErc20Transfer({
          address: ERC20_WITHDRAWAL_ADDRESS,
          amount: 3n,
        }),
      })
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(ReportStatus.ADVANCE_STATUS_SUCCESS);
  });

  it("should ignore withdraw when there is no funds", () => {
    const { reports, outputs } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_WITHDRAWAL_ADDRESS,
      }),
      { collect: true }
    );
    expect(outputs.length).toBe(0);
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_WITHDRAW_NO_FUNDS
    );
  });

  it("should accept inspect when there is no funds", () => {
    const reports = machine.inspect(Buffer.from("SOME RANDOM DATA"), {
      collect: true,
    });
    expect(reports.length).toBe(1);
    expect(hexToBigInt(bytesToHex(reports[0]))).toBe(0n);
  });

  afterAll(() => {
    machine.shutdown();
  });
});

describe("honeypot edge", () => {
  const machine = rollups(MACHINE_STORED_DIR, {
    runtimeConfig: MACHINE_RUNTIME_CONFIG,
  });
  it("should ignore empty input", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({ msgSender: ERC20_PORTAL_ADDRESS, payload: "0x" }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore incomplete deposit input", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: slice(
          encodeErc20Deposit({
            tokenAddress: ERC20_TOKEN_ADDRESS,
            sender: ERC20_ALICE_ADDRESS,
            amount: 1n,
          }),
          0,
          40
        ),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore deposit of an addition overflow", () => {
    const overflowMachine = rollups(MACHINE_STORED_DIR, {
      runtimeConfig: MACHINE_RUNTIME_CONFIG,
    });
    const { reports } = overflowMachine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount:
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(ReportStatus.ADVANCE_STATUS_SUCCESS);

    const { reports: reports2 } = overflowMachine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 1n,
        }),
      }),
      { collect: true }
    );
    expect(reports2.length).toBe(1);
    expect(bytesToHex(reports2[0])).toBe(
      ReportStatus.ADVANCE_STATUS_DEPOSIT_BALANCE_OVERFLOW
    );

    overflowMachine.shutdown();
  });

  it("should ignore input chain id out of supported range", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        chainId: 0x10000000000000000n,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 1n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore input block number out of supported range", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        blockNumber: 0x10000000000000000n,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 1n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore input block timestamp out of supported range", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        blockTimestamp: 0x10000000000000000n,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 1n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore input index out of supported range", () => {
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        index: 0x10000000000000000n,
        payload: encodeErc20Deposit({
          tokenAddress: ERC20_TOKEN_ADDRESS,
          sender: ERC20_ALICE_ADDRESS,
          amount: 1n,
        }),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore input with invalid payload offset", () => {
    const payload = encodeErc20Deposit({
      tokenAddress: ERC20_TOKEN_ADDRESS,
      sender: ERC20_ALICE_ADDRESS,
      amount: 1n,
    });
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: slice(payload, 32),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });

  it("should ignore input with invalid payload length", () => {
    const payload = encodeErc20Deposit({
      tokenAddress: ERC20_TOKEN_ADDRESS,
      sender: ERC20_ALICE_ADDRESS,
      amount: 1n,
    });
    const { reports } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: slice(payload, 0, 13),
      }),
      { collect: true }
    );
    expect(reports.length).toBe(1);
    expect(bytesToHex(reports[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );

    const { reports: reports2 } = machine.advance(
      encodeAdvanceInput({
        msgSender: ERC20_PORTAL_ADDRESS,
        payload: slice(payload, 0, 1),
      }),
      { collect: true }
    );
    expect(reports2.length).toBe(1);
    expect(bytesToHex(reports2[0])).toBe(
      ReportStatus.ADVANCE_STATUS_INVALID_REQUEST
    );
  });
});
