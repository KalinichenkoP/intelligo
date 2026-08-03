import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../../config/configuration';

/** Redis key for the cached DocketAlarm login token. */
const TOKEN_KEY = 'docket-alarm:login_token';

/**
 * Token TTL: 85 minutes (5-minute safety buffer under DocketAlarm's 90-minute expiry).
 */
const TOKEN_TTL_SECONDS = 85 * 60;

/**
 * Redis-backed store for the DocketAlarm `login_token`.
 *
 * No distributed lock is used: a rare redundant `login/` call on concurrent
 * cache misses is cheap and harmless compared to the complexity of locking.
 */
@Injectable()
export class DocketAlarmTokenStore implements OnModuleDestroy {
  private readonly logger = new Logger(DocketAlarmTokenStore.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const redisUrl = this.configService.get('redis.url', { infer: true });
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  /**
   * Ensure the Redis connection is established (idempotent).
   */
  async connect(): Promise<void> {
    if (this.redis.status === 'wait' || this.redis.status === 'end') {
      await this.redis.connect();
    }
  }

  /**
   * Read the cached login token, or null when missing/expired.
   */
  async getToken(): Promise<string | null> {
    await this.connect();
    return this.redis.get(TOKEN_KEY);
  }

  /**
   * Persist a freshly obtained login token with the configured TTL.
   */
  async setToken(token: string): Promise<void> {
    await this.connect();
    await this.redis.set(TOKEN_KEY, token, 'EX', TOKEN_TTL_SECONDS);
    this.logger.debug('Cached DocketAlarm login_token');
  }

  /**
   * Invalidate the cached token (e.g. after a 401 / invalid-token response).
   */
  async clearToken(): Promise<void> {
    await this.connect();
    await this.redis.del(TOKEN_KEY);
    this.logger.warn('Cleared DocketAlarm login_token cache');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== 'end') {
      await this.redis.quit();
    }
  }
}
