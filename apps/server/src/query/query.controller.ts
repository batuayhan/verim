import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { QueryRequest, QueryResponse } from '../contract/api';
import { queryRequestSchema } from '../contract/zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QUERY_ENGINE, type QueryEngine } from './query-engine';

@ApiTags('query')
@Controller('query')
export class QueryController {
  constructor(@Inject(QUERY_ENGINE) private readonly engine: QueryEngine) {}

  @Post()
  @ApiOperation({
    summary: 'Execute a board chain and return the target board output',
    description:
      'Boards apply top-to-bottom; display-only boards (chart/table) are ' +
      'skipped unless targeted. The returned schema is authoritative.',
  })
  @ApiBody({ schema: z.toJSONSchema(queryRequestSchema) as Record<string, unknown> })
  execute(
    @Body(new ZodValidationPipe(queryRequestSchema)) body: QueryRequest,
  ): Promise<QueryResponse> {
    return this.engine.execute(body);
  }
}
