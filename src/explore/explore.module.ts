import { Module } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { ExploreController } from './explore.controller';
import { UniswapService } from './uniswap.service';
import { Multicall3Service } from './multicall3/multicall3.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Token } from './entities/Token.entity';
import { Pool } from './entities/pools.entity';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports:[
    TypeOrmModule.forFeature([Token,Pool]),
    ScheduleModule.forRoot(),

  ],
  controllers: [ExploreController],
  providers: [ExploreService,UniswapService,Multicall3Service],

})
export class ExploreModule {}
