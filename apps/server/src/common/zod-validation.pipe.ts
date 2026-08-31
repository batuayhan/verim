import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { ApiError } from './api-error';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first.path.join('.');
      throw ApiError.invalidBoard(
        `Invalid request${path ? ` at ${path}` : ''}: ${first.message}`,
      );
    }
    return result.data;
  }
}
