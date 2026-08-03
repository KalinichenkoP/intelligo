import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A single name entry on an entity (primary or alias).
 */
export class EntityNameDto {
  @ApiProperty({ example: 'Bradley Friedman' })
  @IsString()
  @IsNotEmpty()
  full!: string;

  @ApiProperty({ example: 0.9, minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;

  @ApiPropertyOptional({
    example: 'LLC',
    description: 'Company type when entityType is Company',
  })
  @IsOptional()
  @IsString()
  type?: string;
}

/**
 * A single address entry on an entity.
 */
export class EntityAddressDto {
  @ApiProperty({ example: '1301 Florida Mall Avenue. Orlando, FL 32809' })
  @IsString()
  @IsNotEmpty()
  full!: string;

  @ApiProperty({ example: 0.8, minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;
}

/**
 * Nested entity details payload.
 */
export class EntityDetailsDto {
  @ApiProperty({ type: [EntityNameDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EntityNameDto)
  name!: EntityNameDto[];

  @ApiPropertyOptional({ type: [EntityAddressDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntityAddressDto)
  address?: EntityAddressDto[];
}

/**
 * Request body for POST /api/v1/legal_results.
 */
export class LegalResultsRequestDto {
  @ApiProperty({ example: 43432 })
  @IsNumber()
  entityId!: number;

  @ApiProperty({ enum: ['Person', 'Company'], example: 'Person' })
  @IsIn(['Person', 'Company'])
  entityType!: 'Person' | 'Company';

  @ApiProperty({ type: EntityDetailsDto })
  @ValidateNested()
  @Type(() => EntityDetailsDto)
  entityDetails!: EntityDetailsDto;
}
