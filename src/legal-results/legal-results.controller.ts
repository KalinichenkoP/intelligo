import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LegalResultsRequestDto } from './dto/legal-results-request.dto';
import { LegalResultsResponseDto } from './dto/legal-results-response.dto';
import { LegalResultsService } from './legal-results.service';

/**
 * Public HTTP API for legal case search.
 */
@ApiTags('legal-results')
@Controller('api/v1/legal_results')
export class LegalResultsController {
  constructor(private readonly legalResultsService: LegalResultsService) {}

  /**
   * Search DocketAlarm (via the legal data provider) for cases involving an entity.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Search legal cases for a Person or Company entity',
    description:
      'Resolves entity names/aliases, narrows DocketAlarm queries to stay within the 250-result budget, ' +
      'deduplicates parallel identical requests via BullMQ jobId, and returns cases sorted by court priority then filing date.',
  })
  @ApiOkResponse({ type: LegalResultsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiServiceUnavailableResponse({
    description: 'Upstream legal data provider unavailable',
  })
  async search(@Body() body: LegalResultsRequestDto): Promise<LegalResultsResponseDto> {
    return this.legalResultsService.search(body);
  }
}
