import { Injectable } from '@nestjs/common';
import { CreateExploreDto } from './dto/create-explore.dto';
import { UpdateExploreDto } from './dto/update-explore.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Tokens } from './entities/tokens.entity';
import { Repository } from 'typeorm';
import { Pool } from './entities/pool.entity';

@Injectable()
export class ExploreService {

  constructor(
    @InjectRepository(Tokens)
    private tokenRepository: Repository<Tokens>,
    @InjectRepository(Pool)
    private poolRepository: Repository<Pool>
){}

  create(createExploreDto: CreateExploreDto) {
    return 'This action adds a new explore';
  }

  findAll() {
    return `This action returns all explore`;
  }

  async getTokens() {
    const tokens: Tokens[] = await this.tokenRepository.find();
    const formattedTokens = tokens.map(token => ({
      id: token.id,
      symbol: token.tokenSymbol,
      name: token.tokenName,
      address: token.tokenAddress,
      price: token.price,
      FDV:token.FDV
    }));

    return formattedTokens;
  }

  async getPools(){
    const pools:Pool[]=await this.poolRepository.find();
    
    const formattedPools = pools.map(pool => ({
      id: pool.id,
      pairsAddress: pool.pairsAddress,
      pairsName: pool.pairsName,
      TVL: pool.TVL,
      APY: pool.APY
    }));

    return formattedPools;
  }

  findOne(id: number) {
    return `This action returns a #${id} explore`;
  }

  update(id: number, updateExploreDto: UpdateExploreDto) {
    return `This action updates a #${id} explore`;
  }

  remove(id: number) {
    return `This action removes a #${id} explore`;
  }
}
