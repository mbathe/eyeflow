import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { utilities as nestWinstonUtilities } from 'nest-winston';
import * as path from 'path';

/**
 * Centralized Logging Service
 * Captures all app logs to:
 * - Console (development)
 * - Files (production)
 * - Tracks performance metrics
 */

const logsDir = path.join(process.cwd(), 'logs');

// Define log levels with priorities
const logLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
  colors: {
    fatal: 'red',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'gray',
  },
};

// Transports configuration
const transports = [
  // Console output
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.ms(),
      nestWinstonUtilities.format.nestLike('EyeFlow', {
        colors: true,
        prettyPrint: true,
      }),
    ),
    level: process.env.LOG_LEVEL || 'debug',
  }),

  // Error logs - daily rotation
  new DailyRotateFile({
    filename: path.join(logsDir, 'errors/error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    maxSize: '20m',
    maxFiles: '14d',
  }),

  // Combined logs - daily rotation
  new DailyRotateFile({
    filename: path.join(logsDir, 'combined/combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.json(),
    ),
    maxSize: '20m',
    maxFiles: '30d',
  }),

  // Performance logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'performance/performance-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.json(),
    ),
    maxSize: '20m',
    maxFiles: '30d',
  }),
];

// Create logger instance
export const logger = winston.createLogger({
  levels: logLevels.levels,
  defaultMeta: {
    service: 'eyeflow-server',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log') }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'rejections.log') }),
  ],
});

// Add colors
winston.addColors(logLevels.colors);

/**
 * NestJS Winston Module export
 */
export const createNestWinstonConfig = () => {
  return {
    transports,
    levels: logLevels.levels,
  };
};

/**
 * Utility: Log with contextual info
 */
export interface LogContext {
  userId?: string;
  requestId?: string;
  service?: string;
  action?: string;
  duration?: number;
  statusCode?: number;
  error?: string;
  errorType?: string;
  stack?: string;
  queryParams?: Record<string, any>;
  pathParams?: Record<string, any>;
  bodyKeys?: string[];
  responseSize?: number;
  ruleId?: string;
  ruleName?: string;
  currentStatus?: string;
  feedbackLength?: number;
  key?: string;
  pattern?: string;
  type?: string;
  ttl?: number;
  valueSize?: number;
  deleted?: boolean;
  keysDeleted?: number;
  metadata?: Record<string, any>;
}

export const logWithContext = (level: string, message: string, context: LogContext) => {
  const logData = {
    timestamp: new Date().toISOString(),
    ...context,
  };
  logger.log(level, message, logData);
};

/**
 * Performance logging helper
 */
export const measurePerformance = async (
  operation: string,
  fn: () => Promise<any>,
  context?: Partial<LogContext>,
) => {
  const startTime = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    if (duration > 1000) {
      // Log if slow (>1s)
      logWithContext('warn', `Slow operation: ${operation}`, {
        ...context,
        duration,
      });
    } else {
      logWithContext('debug', `Operation completed: ${operation}`, {
        ...context,
        duration,
      });
    }

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logWithContext('error', `Operation failed: ${operation}`, {
      ...context,
      duration,
      error: err?.message || 'Unknown error',
      errorType: err?.constructor?.name || 'Error',
      stack: err?.stack,
    });
    throw err;
  }
};
