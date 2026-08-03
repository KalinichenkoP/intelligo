import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { RedisHealthClient } from './redis-health-client.service';

/**
 * Liveness / readiness probes.
 * Redis connectivity is checked as a readiness signal for queue + token cache,
 * reusing a single shared connection (see RedisHealthClient) instead of opening
 * a new one per request.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redisHealthClient: RedisHealthClient,
  ) {}

  /**
   * Combined health check — Redis must be reachable.
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Service health (Redis connectivity)' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      async (): Promise<HealthIndicatorResult> => this.checkRedis(),
    ]);
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      const pong: string = await this.redisHealthClient.ping();
      if (pong !== 'PONG') {
        return {
          redis: {
            status: 'down',
            message: `Unexpected PING response: ${String(pong)}`,
          },
        };
      }
      return { redis: { status: 'up' } };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Redis check failed';
      return { redis: { status: 'down', message } };
    }
  }
}
