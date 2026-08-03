import * as Joi from 'joi';

/**
 * Joi schema that fails fast on boot when required environment variables are missing
 * or have invalid types/ranges.
 */
export const envValidationSchema: Joi.ObjectSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  DOCKET_ALARM_USERNAME: Joi.string().required(),
  DOCKET_ALARM_PASSWORD: Joi.string().required(),
  DOCKET_ALARM_BASE_URL: Joi.string().uri().default('https://www.docketalarm.com/api/v1'),
  DOCKET_ALARM_CLIENT_MATTER: Joi.string().default('intelligo-legal-results'),
  DOCKET_ALARM_MAX_CONCURRENCY: Joi.number().integer().min(1).default(5),
  DOCKET_ALARM_RATE_LIMIT_MAX: Joi.number().integer().min(1).default(5),
  DOCKET_ALARM_RATE_LIMIT_DURATION_MS: Joi.number().integer().min(100).default(1000),
  DOCKET_ALARM_RETRY_ATTEMPTS: Joi.number().integer().min(1).default(3),
  DOCKET_ALARM_RETRY_BACKOFF_MS: Joi.number().integer().min(100).default(1000),

  REDIS_URL: Joi.string().uri().required(),

  RESULT_CACHE_TTL_SECONDS: Joi.number().integer().min(0).default(30),
  FAILED_JOB_RETENTION_SECONDS: Joi.number().integer().min(0).default(10),
  JOB_WAIT_TIMEOUT_MS: Joi.number().integer().min(1000).default(20000),

  ALIAS_MIN_CONFIDENCE: Joi.number().min(0).max(1).default(0.3),
  MAX_ALIAS_NAMES: Joi.number().integer().min(0).default(5),

  THROTTLE_TTL_MS: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(60),
});
