import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  Logger,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import * as uuid from 'uuid';
import { Request, Response } from 'express';
import { logWithContext, LogContext } from './logger.service';

/**
 * HTTP Logging Interceptor
 * Logs all incoming requests and outgoing responses
 * Includes: method, path, status, duration, userId, errors
 */

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Generate unique request ID for tracing
    const requestId = uuid.v4();
    (request as any).requestId = requestId;

    const startTime = Date.now();
    const { method, url, body, query, params } = request;

    // Extract user info if available (from JWT/guards)
    const userId = (request as any).user?.id || 'anonymous';

    const logContext: LogContext = {
      requestId,
      userId,
      service: 'http',
      action: `${method} ${url}`,
    };

    // Log incoming request
    logWithContext('info', `[${method}] ${url} - Request received`, {
      ...logContext,
      queryParams: query,
      pathParams: params,
      // Don't log sensitive data in body
      bodyKeys: body ? Object.keys(body) : [],
    });

    return next.handle().pipe(
      tap((data) => {
        const statusCode = response.statusCode;
        const duration = Date.now() - startTime;

        // Log successful response
        logWithContext(
          statusCode >= 400 ? 'warn' : 'info',
          `[${method}] ${url} - Response: ${statusCode}`,
          {
            ...logContext,
            statusCode,
            duration,
            responseSize: JSON.stringify(data).length || 0,
          },
        );

        // Add request ID to response headers for tracing
        response.setHeader('X-Request-ID', requestId);
      }),
      catchError((error: any) => {
        const duration = Date.now() - startTime;

        // Log error
        logWithContext('error', `[${method}] ${url} - Error occurred`, {
          ...logContext,
          statusCode: error.status || 500,
          duration,
          error: error.message,
          errorType: error.constructor.name,
          stack: error.stack,
        });

        response.setHeader('X-Request-ID', requestId);
        throw error;
      }),
    );
  }
}
