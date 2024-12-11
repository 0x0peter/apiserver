// src/utils/multicall3.util.ts
import { Interface } from '@ethersproject/abi';
import { BigNumber } from 'ethers';

export interface Call3 {
  target: string;
  allowFailure: boolean;
  callData: string;
}

export interface Call3Result {
  success: boolean;
  returnData: string;
}

export interface Multicall3Config {
  address: string;  // Multicall3 合约地址
  abi: any[];      // Multicall3 ABI
}
// Multicall3 ABI
export const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])',
  'function aggregate3Value(tuple(address target, bool allowFailure, uint256 value, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])'
];