import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Global exception filter for database and query errors
 * Converts database errors into user-friendly API responses
 */
@Catch(QueryFailedError)
export class QueryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status = HttpStatus.BAD_REQUEST;
    const errorMessage = exception.message || 'Database query failed';

    // Log the error for debugging
    this.logger.error(
      `Database Error on ${request.method} ${request.url}: ${errorMessage}`,
      exception.stack,
    );

    // Parse the database error
    let userMessage = 'Invalid request data';

    if (
      errorMessage.includes('invalid input syntax for type uuid') ||
      errorMessage.includes('violates unique constraint')
    ) {
      userMessage = this.parseDatabaseError(errorMessage);
    }

    response.status(status).json({
      statusCode: status,
      error: 'Bad Request',
      message: userMessage,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Parse database error messages into user-friendly text
   */
  private parseDatabaseError(message: string): string {
    if (message.includes('invalid input syntax for type uuid')) {
      // Extract the invalid value from error message
      const match = message.match(/"([^"]*)"/);
      const value = match ? match[1] : 'value';
      return `Invalid UUID format provided. Expected a valid UUID, got: "${value}". Please check headers and path parameters.`;
    }

    if (message.includes('violates unique constraint')) {
      return 'This resource already exists. Duplicate entries are not allowed.';
    }

    if (message.includes('violates foreign key constraint')) {
      return 'Referenced resource not found. Please ensure all IDs are valid.';
    }

    if (message.includes('column') && message.includes('does not exist')) {
      return 'Invalid request - unknown field. Please check your input.';
    }

    return 'Database operation failed. Please verify your input and try again.';
  }
}
