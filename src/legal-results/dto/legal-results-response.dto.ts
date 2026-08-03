import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single legal case in the API response.
 */
export class LegalCaseDto {
  @ApiProperty({ example: '1:23-cv-01234' })
  docket!: string;

  @ApiProperty({ example: 'Florida Middle District Court' })
  court!: string;

  @ApiProperty({ example: 'Smith v. Jones' })
  title!: string;

  @ApiPropertyOptional({
    example: '2023-05-12',
    nullable: true,
    description: 'ISO 8601 filing date, or null when missing/unparseable',
  })
  dateFiled!: string | null;

  @ApiProperty({ example: 'https://www.docketalarm.com/cases/...' })
  link!: string;

  @ApiProperty({ enum: ['docket', 'document'], example: 'docket' })
  resultType!: 'docket' | 'document';
}

/**
 * Operational metadata returned alongside results.
 * Additive extension beyond the minimal assignment contract for observability.
 */
export class LegalResultsMetaDto {
  @ApiProperty({
    example: 2,
    description: 'How many of the entity names (primary + aliases) were actually queried',
  })
  namesSearched!: number;

  @ApiProperty({
    example: 42,
    description: 'Number of cases returned (always <= 250)',
  })
  returned!: number;

  @ApiProperty({
    example: false,
    description:
      'True when a name query exceeded 250 and was capped, or remaining aliases were skipped because the global cap was reached',
  })
  truncated!: boolean;
}

/**
 * Response body for POST /api/v1/legal_results.
 */
export class LegalResultsResponseDto {
  @ApiProperty({ type: [LegalCaseDto] })
  results!: LegalCaseDto[];

  @ApiProperty({ type: LegalResultsMetaDto })
  meta!: LegalResultsMetaDto;
}
