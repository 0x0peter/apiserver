// src/services/multicall3.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, Contract, utils } from 'ethers';
import { Call3, Call3Result, MULTICALL3_ABI } from './multicall3.util';

@Injectable()
export class Multicall3Service {
    private readonly logger = new Logger(Multicall3Service.name);
    private provider: ethers.providers.JsonRpcProvider;
    private multicall3: Contract;
    private readonly MULTICALL3_ADDRESS: string;

    constructor(private configService: ConfigService) {
        const rpcUrl = this.configService.get<string>('RPC_URL');
        this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const multicall3Address = this.configService.get<string>('MULTICALL3_ADDRESS')!;
        this.MULTICALL3_ADDRESS=multicall3Address;
        this.multicall3 = new ethers.Contract(
            multicall3Address,
            MULTICALL3_ABI,
            this.provider
        );

    }
    getMulticallAddress(): string {
        return this.MULTICALL3_ADDRESS;
    }

    async aggregate3(calls: Call3[]): Promise<Call3Result[]> {
        try {
            const results = await this.multicall3.callStatic.aggregate3(calls);
            return results;
        } catch (error) {
            this.logger.error(`Multicall3 aggregate3 failed: ${error.message}`);
            throw error;
        }
    }

    // 创建调用数据
    createCallData(contractInterface: utils.Interface, functionName: string, params: any[] = []): string {
        return contractInterface.encodeFunctionData(functionName, params);
    }

    // 解码返回数据
    decodeCallResult(contractInterface: utils.Interface, functionName: string, data: string): any {
        return contractInterface.decodeFunctionResult(functionName, data);
    }
}