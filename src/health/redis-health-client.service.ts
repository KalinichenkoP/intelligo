import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

/**
 * Shared Redis connection reused across health checks.
 *
 * Previously `HealthController` opened a brand-new `ioredis` connection and
 * disconnected it on every `GET /health` call, which is wasteful under
 * frequent liveness/readiness polling (e.g. Kubernetes probing every few
 * seconds). This service holds one lazily-connected client for the lifetime
 * of the process instead, reconnecting only if the connection has dropped.
 */
@Injectable()
export class RedisHealthClient implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthClient.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const redisUrl = this.configService.get('redis.url', { infer: true });
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Redis health connection error: ${error.message}`);
    });
  }

  /**
   * Ping the shared connection, (re)connecting lazily on first use or after a drop.
   */
  async ping(): Promise<string> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
    }
    return this.redis.ping();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
