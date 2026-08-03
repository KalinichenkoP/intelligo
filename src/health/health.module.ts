import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthClient } from './redis-health-client.service';

/**
 * Exposes /health for liveness and readiness probes.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthClient],
})
export class HealthModule {}
