import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { CreateExploreDto } from './dto/create-explore.dto';
import { UpdateExploreDto } from './dto/update-explore.dto';
import { UniswapService } from './uniswap.service';


@Controller('explore')
export class ExploreController {
  constructor(private readonly exploreService: ExploreService,
    private readonly uniswapService:UniswapService
  ) {}

  @Get()
  async getAllPairsWithDetails(){
   return await this.uniswapService.getAllPairsWithDetails();

  }


  @Get('/pools')
  async getPools(){
   return await this.exploreService.getPools();
  }


  @Get('/tokens')
  async getTokens(){
    return await this.exploreService.getTokens();
  }

  @Post()
  create(@Body() createExploreDto: CreateExploreDto) {
    return this.exploreService.create(createExploreDto);
  }

  @Get()
  findAll() {
    return this.exploreService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.exploreService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExploreDto: UpdateExploreDto) {
    return this.exploreService.update(+id, updateExploreDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.exploreService.remove(+id);
  }
}
