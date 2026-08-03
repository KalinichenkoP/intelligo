import { Module } from '@nestjs/common';
import { SearchQueueModule } from '../search-queue/search-queue.module';
import { EntityResolverService } from './entity-resolver.service';
import { LegalResultsController } from './legal-results.controller';
import { LegalResultsService } from './legal-results.service';

/**
 * Nest module owning the public legal-results endpoint and entity resolution.
 */
@Module({
  imports: [SearchQueueModule],
  controllers: [LegalResultsController],
  providers: [LegalResultsService, EntityResolverService],
  exports: [LegalResultsService, EntityResolverService],
})
export class LegalResultsModule {}
