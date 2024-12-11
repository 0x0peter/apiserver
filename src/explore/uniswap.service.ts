// src/services/uniswap.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, Contract } from 'ethers';
import { Multicall3Service } from './multicall3/multicall3.service';
import { HSKPrice, USDTPrice } from './price/price';
import { Token } from './entities/Token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pool } from './entities/Pools.entity';
import { Cron } from '@nestjs/schedule';

// 添加 ERC20 ABI 常量
const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint256)',
    'function totalSupply() view returns (uint256)'
];

@Injectable()
export class UniswapService implements OnModuleInit {
    private readonly logger = new Logger(UniswapService.name);
    private FACTORY_ADDRESS;
    private readonly factoryInterface: ethers.utils.Interface;
    private readonly pairInterface: ethers.utils.Interface;
    private readonly erc20Interface: ethers.utils.Interface;

    constructor(
        private configService: ConfigService,
        private multicall3Service: Multicall3Service,
        @InjectRepository(Token)
        private tokenRepository: Repository<Token>,
        @InjectRepository(Pool)
        private poolRepository: Repository<Pool>
    ) {

        this.factoryInterface = new ethers.utils.Interface([
            'function allPairsLength() external view returns (uint)',
            'function allPairs(uint) external view returns (address)',
        ]);

        this.pairInterface = new ethers.utils.Interface([
            'function token0() external view returns (address)',
            'function token1() external view returns (address)',
            'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
        ]);

        this.erc20Interface = new ethers.utils.Interface([
            'function name() view returns (string)',
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)',
            'function balanceOf(address owner) view returns (uint256)',
            'function totalSupply() view returns (uint256)'
        ]);

    }

    // 在模块初始化时设置合约
    async onModuleInit() {
        const rpcUrl = this.configService.get<string>('RPC_URL');
        if (!rpcUrl) {
            throw new Error('RPC_URL not configured');
        }

        this.FACTORY_ADDRESS = this.configService.get<string>('FACTORY_ADDRESS');
    }
    
    @Cron('*/10 * * * *')  // 每10分钟执行一次
    async getAllPairsWithDetails() {
        console.log('Executing task every 10 minutes');
        try {

            const lengthCall = {
                target: this.FACTORY_ADDRESS,
                allowFailure: false,
                callData: this.multicall3Service.createCallData(
                    this.factoryInterface,
                    'allPairsLength'
                ),
            };

            const [lengthResult] = await this.multicall3Service.aggregate3([lengthCall]);
            if (!lengthResult.success) {
                throw new Error('Failed to get pairs length');
            }
            const pairsLength = Number(
                this.factoryInterface.decodeFunctionResult(
                    'allPairsLength',
                    lengthResult.returnData
                )[0]
            );
            // 2. 获取所有交易对地址
            const pairAddressCalls = Array.from({ length: Math.min(pairsLength, 100) }, (_, i) => ({
                target: this.FACTORY_ADDRESS,
                allowFailure: false,
                callData: this.multicall3Service.createCallData(
                    this.factoryInterface,
                    'allPairs',
                    [i]
                ),
            }));

            const pairAddressResults = await this.multicall3Service.aggregate3(pairAddressCalls);
            const pairAddresses = pairAddressResults.map(result =>
                this.factoryInterface.decodeFunctionResult('allPairs', result.returnData)[0]
            );

            // 3. 获取每个交易对的详细信息
            const pairDetailCalls = pairAddresses.flatMap(pairAddress => [
                {
                    target: pairAddress,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.pairInterface, 'token0'),
                },
                {
                    target: pairAddress,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.pairInterface, 'token1'),
                },
                {
                    target: pairAddress,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.pairInterface, 'getReserves'),
                },
            ]);

            const pairDetailsResults = await this.multicall3Service.aggregate3(pairDetailCalls);

            // 4. 处理结果
            const pairs: any[] = [];
            for (let i = 0; i < pairAddresses.length; i++) {
                const baseIndex = i * 3;
                const token0Result = pairDetailsResults[baseIndex];
                const token1Result = pairDetailsResults[baseIndex + 1];
                const reservesResult = pairDetailsResults[baseIndex + 2];

                if (token0Result.success && token1Result.success && reservesResult.success) {
                    const token0 = this.pairInterface.decodeFunctionResult('token0', token0Result.returnData)[0];
                    const token1 = this.pairInterface.decodeFunctionResult('token1', token1Result.returnData)[0];
                    const reserves = this.pairInterface.decodeFunctionResult('getReserves', reservesResult.returnData);

                    pairs.push({
                        address: pairAddresses[i],
                        token0,
                        token1,
                        reserves: {
                            token0Balance: reserves[0].toString(),
                            token1Balance: reserves[1].toString(),
                            blockTimestampLast: reserves[2].toString(),
                        },

                    });
                }
            }

            // 在返回结果之前添加价格计算
            const pairsWithMetrics = await this.calculateTokenMetrics(pairs);
            const pairMetrics = await this.calculatePairMetrics(pairs);

            // 保存 pool 数据到数据库
            await Promise.all(
                pairMetrics.map(async (pool) => {
                    await this.poolRepository.upsert(
                        {
                            pairsAddress: pool.pairsAddress,
                            pairsName: pool.pairsName,
                            TVL: pool.TVL,
                            APY: pool.APY,
                            blockNumber: pool.blockNumber,
                            updatedAt: new Date()
                        },
                        {
                            conflictPaths: ['pairsAddress'],
                            skipUpdateIfNoValuesChanged: true
                        }
                    );
                })
            );

            const uniqueTokens = Array.from(
                new Map(
                    pairsWithMetrics.flat().map(token => [token.tokenAddress, token])
                ).values()
            );
            // 取出pairsWithMetrics中的 Token0 Token1,根据token Address 去重, 展开成1维数组存到Postgelsql
            await Promise.all(
                uniqueTokens.map(async (token) => {
                    await this.tokenRepository.upsert(
                        {
                            tokenAddress: token.tokenAddress,
                            tokenName: token.tokenName,
                            tokenSymbol: token.tokenSymbol,
                            price: token.price,
                            FDV: token.FDV,
                            blockNumber: token.blockNumber,
                            updatedAt: new Date()
                        },
                        {
                            conflictPaths: ['tokenAddress'],
                            skipUpdateIfNoValuesChanged: true
                        }
                    );
                })
            );





            return pairsWithMetrics;

        } catch (error) {
            this.logger.error(`Error getting pairs: ${error.message}`);
            throw error;
        }
    }

    async calculateTokenMetrics(pairs: any[]) {
        // 创建获取区块高度的调用
        const blockNumberCall = {
            target: this.multicall3Service.getMulticallAddress(),
            allowFailure: false,
            callData: this.multicall3Service.createCallData(
                new ethers.utils.Interface(['function getBlockNumber() view returns (uint256)']),
                'getBlockNumber'
            ),
        };

        // 合并区块高度调用和代币信息调用
        const tokenCalls = [
            blockNumberCall,
            ...pairs.flatMap(pair => [
                {
                    target: pair.token0,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'name'),
                },
                {
                    target: pair.token0,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'symbol'),
                },
                {
                    target: pair.token0,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'decimals'),
                },
                {
                    target: pair.token0,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'totalSupply'),
                },
                {
                    target: pair.token1,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'name'),
                },
                {
                    target: pair.token1,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'symbol'),
                },
                {
                    target: pair.token1,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'decimals'),
                },
                {
                    target: pair.token1,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'totalSupply'),
                },
            ])
        ];

        const allResults = await this.multicall3Service.aggregate3(tokenCalls);

        // 解析区块高度
        const blockNumber = Number(
            new ethers.utils.Interface(['function getBlockNumber() view returns (uint256)'])
                .decodeFunctionResult('getBlockNumber', allResults[0].returnData)[0]
        );

        // 调整后续代码中的索引计算
        return pairs.flatMap((pair, index) => {
            const baseIndex = (index * 8) + 1; // +1 是因为第一个结果是区块高度

            const token0Name = this.erc20Interface.decodeFunctionResult('name', allResults[baseIndex].returnData)[0];
            const token0Symbol = this.erc20Interface.decodeFunctionResult('symbol', allResults[baseIndex + 1].returnData)[0];
            const token0Decimals = Number(this.erc20Interface.decodeFunctionResult('decimals', allResults[baseIndex + 2].returnData)[0]);
            const token0TotalSupply = this.erc20Interface.decodeFunctionResult('totalSupply', allResults[baseIndex + 3].returnData)[0];

            const token1Name = this.erc20Interface.decodeFunctionResult('name', allResults[baseIndex + 4].returnData)[0];
            const token1Symbol = this.erc20Interface.decodeFunctionResult('symbol', allResults[baseIndex + 5].returnData)[0];
            const token1Decimals = Number(this.erc20Interface.decodeFunctionResult('decimals', allResults[baseIndex + 6].returnData)[0]);
            const token1TotalSupply = this.erc20Interface.decodeFunctionResult('totalSupply', allResults[baseIndex + 7].returnData)[0];

            const reserve0 = ethers.utils.formatUnits(pair.reserves.token0Balance, token0Decimals);
            const reserve1 = ethers.utils.formatUnits(pair.reserves.token1Balance, token1Decimals);

            const token0Total = ethers.utils.formatUnits(token0TotalSupply, token0Decimals);
            const token1Total = ethers.utils.formatUnits(token1TotalSupply, token1Decimals);
            let currentToken0Price = 0;
            let currentToken1Price = 0;

            // 如果token1是HSK
            if (pair.token1 === HSKPrice.address) {
                // 使用HSK价格计算token0的价格
                currentToken0Price = Number(reserve1) / Number(reserve0) * HSKPrice.price;
                currentToken1Price = HSKPrice.price;
            }
            // 如果token0是USDT
            else if (pair.token0 === USDTPrice.address) {
                // USDT作为基准价格
                currentToken0Price = USDTPrice.price;
                currentToken1Price = Number(reserve0) / Number(reserve1) * USDTPrice.price;
            }
            // 其他情况，尝试通过已知价格推导
            else if (currentToken0Price > 0) {
                currentToken1Price = Number(reserve0) / Number(reserve1) * currentToken0Price;
            } else if (currentToken1Price > 0) {
                currentToken0Price = Number(reserve1) / Number(reserve0) * currentToken1Price;
            }



            this.logger.debug(`token0TotalSupply${token0Total}`);
            this.logger.debug(`token1TotalSupply${token1Total}`);
            // 使用实际的总供应量计算 FDV
            const token0Fdv = currentToken0Price * Number(token0Total);
            const token1Fdv = currentToken1Price * Number(token1Total);
            return [
                {
                    tokenAddress: pair.token0,
                    tokenName: token0Name,
                    tokenSymbol: token0Symbol,
                    price: currentToken0Price,
                    FDV: token0Fdv,
                    blockNumber: blockNumber
                },
                {
                    tokenAddress: pair.token1,
                    tokenName: token1Name,
                    tokenSymbol: token1Symbol,
                    price: currentToken1Price,
                    FDV: token1Fdv,
                    blockNumber: blockNumber
                }
            ]
        });
    }

    async calculatePairMetrics(pairs: any[]) {
        try {
            // 获取代币信息的调用
            const tokenCalls = pairs.flatMap(pair => [
                {
                    target: pair.token0,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'symbol'),
                },
                {
                    target: pair.token1,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'decimals'),
                },
                {
                    target: pair.token0,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'decimals'),
                },
                {
                    target: pair.token1,
                    allowFailure: false,
                    callData: this.multicall3Service.createCallData(this.erc20Interface, 'symbol'),
                }
            ]);

            const tokenResults = await this.multicall3Service.aggregate3(tokenCalls);
            // 解析区块高度
            const blockNumber = Number(
                new ethers.utils.Interface(['function getBlockNumber() view returns (uint256)'])
                    .decodeFunctionResult('getBlockNumber', tokenResults[0].returnData)[0]
            );

            return Promise.all(pairs.map(async (pair, index) => {
                const baseIndex = index * 4;

                // 解码代币信息
                const token0Symbol = this.erc20Interface.decodeFunctionResult('symbol', tokenResults[baseIndex].returnData)[0];
                const token1Decimals = Number(this.erc20Interface.decodeFunctionResult('decimals', tokenResults[baseIndex + 1].returnData)[0]);
                const token0Decimals = Number(this.erc20Interface.decodeFunctionResult('decimals', tokenResults[baseIndex + 2].returnData)[0]);
                const token1Symbol = this.erc20Interface.decodeFunctionResult('symbol', tokenResults[baseIndex + 3].returnData)[0];

                // 格式化reserve值
                const reserve0 = ethers.utils.formatUnits(pair.reserves.token0Balance, token0Decimals);
                const reserve1 = ethers.utils.formatUnits(pair.reserves.token1Balance, token1Decimals);

                // 计算代币价格
                let token0Price = 0;
                let token1Price = 0;

                // 如果token1是HSK
                if (pair.token1.toLowerCase() === HSKPrice.address.toLowerCase()) {
                    token0Price = Number(reserve1) / Number(reserve0) * HSKPrice.price;
                    token1Price = HSKPrice.price;
                }
                // 如果token0是USDT
                else if (pair.token0.toLowerCase() === USDTPrice.address.toLowerCase()) {
                    token0Price = USDTPrice.price;
                    token1Price = Number(reserve0) / Number(reserve1) * USDTPrice.price;
                }

                // 计算TVL (使用格式化后的reserve值)
                const token0TVL = Number(reserve0) * token0Price;
                const token1TVL = Number(reserve1) * token1Price;
                const totalTVL = token0TVL + token1TVL;

                // 计算APY (这里需要根据实际情况补充交易量和手续费等数据)
                // 这是一个示例计算，实际项目中需要根据真实数据计算
                const dailyFeeRate = 0.003; // 0.3% 交易手续费
                const estimatedDailyVolume = totalTVL * 0.05; // 假设每日交易量是TVL的5%
                const dailyFees = estimatedDailyVolume * dailyFeeRate;
                const APY = (dailyFees * 365 / totalTVL) * 100; // 转换为百分比

                return {
                    pairsAddress: pair.address,
                    pairsName: `${token0Symbol}/${token1Symbol}`,
                    TVL: totalTVL,
                    APY: APY,
                    blockNumber:blockNumber
                };
            }));
        } catch (error) {
            this.logger.error(`Error calculating pair metrics: ${error.message}`);
            throw error;
        }
    }
}