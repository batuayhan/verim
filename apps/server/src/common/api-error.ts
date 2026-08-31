import { HttpException, HttpStatus } from '@nestjs/common';
import type { QueryError } from '../contract/api';

const STATUS_BY_CODE: Record<QueryError['code'], HttpStatus> = {
  DATASET_NOT_FOUND: HttpStatus.NOT_FOUND,
  INVALID_BOARD_CONFIG: HttpStatus.BAD_REQUEST,
  EXPRESSION_ERROR: HttpStatus.BAD_REQUEST,
  PARAMETER_MISSING: HttpStatus.BAD_REQUEST,
  RESULT_TOO_LARGE: HttpStatus.UNPROCESSABLE_ENTITY,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
};

/** Throws as the exact QueryError JSON shape defined in the contract. */
export class ApiError extends HttpException {
  constructor(error: QueryError) {
    super(error, STATUS_BY_CODE[error.code]);
  }

  static datasetNotFound(datasetId: string): ApiError {
    return new ApiError({
      code: 'DATASET_NOT_FOUND',
      message: `Dataset not found: ${datasetId}`,
    });
  }

  static invalidBoard(message: string, boardIndex?: number): ApiError {
    return new ApiError({ code: 'INVALID_BOARD_CONFIG', message, boardIndex });
  }

  static expression(message: string, boardIndex?: number): ApiError {
    return new ApiError({ code: 'EXPRESSION_ERROR', message, boardIndex });
  }

  static parameterMissing(name: string, boardIndex?: number): ApiError {
    return new ApiError({
      code: 'PARAMETER_MISSING',
      message: `Missing parameter: $${name}`,
      boardIndex,
    });
  }
}
