import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SEARCH_PROVIDER, type SearchHit, type SearchProvider } from './search-provider';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_PROVIDER) private readonly search: SearchProvider) {}

  @Get()
  @ApiOperation({ summary: 'Ontoloji nesnelerinde global arama' })
  async query(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<{ hits: SearchHit[] }> {
    const n = Math.min(Math.max(Number(limit ?? 20), 1), 50);
    const hits = q ? await this.search.search(q, n) : [];
    return { hits };
  }
}
