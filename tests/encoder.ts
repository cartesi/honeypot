import {
  Address,
  encodeFunctionData,
  encodePacked,
  erc20Abi,
  Hex,
  hexToBytes,
  zeroAddress,
} from "viem";
import { inputsAbi, outputsAbi } from "./contracts";

type AdvanceInput = {
  chainId?: bigint;
  appContract?: Address;
  msgSender: Address;
  blockNumber?: bigint;
  blockTimestamp?: bigint;
  prevRandao?: bigint;
  index?: bigint;
  payload?: Hex;
};

export const encodeAdvanceInput = (data: AdvanceInput): Buffer => {
  const {
    chainId = 0n,
    appContract = zeroAddress,
    msgSender = zeroAddress,
    blockNumber = 0n,
    blockTimestamp = 0n,
    prevRandao = 0n,
    index = 0n,
    payload = "0x",
  } = data;
  return Buffer.from(
    hexToBytes(
      encodeFunctionData({
        abi: inputsAbi,
        functionName: "EvmAdvance",
        args: [
          chainId,
          appContract,
          msgSender,
          blockNumber,
          blockTimestamp,
          prevRandao,
          index,
          payload,
        ],
      })
    )
  );
};

type ERC20Deposit = {
  tokenAddress: Address;
  sender: Address;
  amount: bigint;
  execLayerData?: Hex;
};

type Erc20Transfer = {
  address: Address;
  amount: bigint;
};

type Voucher = {
  destination: Address;
  value: bigint;
  payload: Hex;
};

export const encodeErc20Deposit = (data: ERC20Deposit) => {
  const { tokenAddress, sender, amount, execLayerData = "0x" } = data;
  return encodePacked(
    ["address", "address", "uint256", "bytes"],
    [tokenAddress, sender, amount, execLayerData]
  );
};

export const encodeVoucherOutput = (data: Voucher) => {
  return encodeFunctionData({
    abi: outputsAbi,
    functionName: "Voucher",
    args: [data.destination, data.value, data.payload],
  });
};

export const encodeErc20Transfer = (data: Erc20Transfer) => {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [data.address, data.amount],
  });
};
