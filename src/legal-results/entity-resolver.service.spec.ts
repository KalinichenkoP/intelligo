import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { EntityResolverService } from './entity-resolver.service';
import { LegalResultsRequestDto } from './dto/legal-results-request.dto';
import sampleEntities from '../../test/fixtures/sample-entities.json';

function createResolver(
  aliases: { minConfidence: number; maxNames: number } = {
    minConfidence: 0.3,
    maxNames: 5,
  },
): EntityResolverService {
  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'aliases') {
        return aliases;
      }
      return undefined;
    }),
  } as unknown as ConfigService<AppConfig, true>;

  return new EntityResolverService(configService);
}

describe('EntityResolverService', () => {
  const bradley = sampleEntities[0] as unknown as LegalResultsRequestDto;
  const robert = sampleEntities[1] as unknown as LegalResultsRequestDto;
  const westlake = sampleEntities[2] as unknown as LegalResultsRequestDto;
  const goldman = sampleEntities[3] as unknown as LegalResultsRequestDto;
  const christopher = sampleEntities[4] as unknown as LegalResultsRequestDto;

  it('selects highest-confidence name as primary for Bradley Friedman', () => {
    const criteria = createResolver().resolve(bradley);
    expect(criteria.names[0]?.full).toBe('Bradley Friedman');
    expect(criteria.names.map((n) => n.full)).toEqual([
      'Bradley Friedman',
      'Brad Gof Friedman',
    ]);
    expect(criteria.states).toEqual(['FL']);
  });

  it('excludes Robert Gilbert low-confidence alias below ALIAS_MIN_CONFIDENCE', () => {
    const criteria = createResolver({ minConfidence: 0.3, maxNames: 5 }).resolve(robert);
    expect(criteria.names.map((n) => n.full)).toEqual(['Robert Gilbert']);
    expect(criteria.states.sort()).toEqual(['AZ', 'ID', 'MO', 'UT']);
  });

  it('includes Robert Gilbert alias when confidence floor is lowered', () => {
    const criteria = createResolver({ minConfidence: 0.1, maxNames: 5 }).resolve(robert);
    expect(criteria.names.map((n) => n.full)).toEqual(['Robert Gilbert', 'Rob T Gil']);
  });

  it('resolves company type for Westlake Services and Goldman Sachs', () => {
    const westlakeCriteria = createResolver().resolve(westlake);
    expect(westlakeCriteria.entityType).toBe('Company');
    expect(westlakeCriteria.companyType).toBe('LLC');
    expect(westlakeCriteria.names[0]?.full).toBe('Westlake Services');
    expect(westlakeCriteria.states).toEqual([]);

    const goldmanCriteria = createResolver().resolve(goldman);
    expect(goldmanCriteria.companyType).toBe('LLC');
    expect(goldmanCriteria.names[0]?.full).toBe('GOLDMAN SACHS');
  });

  it('filters Christopher Brien aliases by confidence and maxNames', () => {
    const defaultCriteria = createResolver().resolve(christopher);
    expect(defaultCriteria.names.map((n) => n.full)).toEqual([
      'Christopher Brien',
      'Chris Brien',
    ]);
    expect(defaultCriteria.states).toEqual(['NY']);

    const capped = createResolver({ minConfidence: 0, maxNames: 1 }).resolve(christopher);
    expect(capped.names.map((n) => n.full)).toEqual(['Christopher Brien', 'Chris Brien']);
    expect(capped.names).toHaveLength(2);
  });

  it('always includes a 10-year date window', () => {
    const criteria = createResolver().resolve(bradley);
    const from = new Date(criteria.dateFrom);
    const to = new Date(criteria.dateTo);
    const years = (to.getTime() - from.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    expect(years).toBeGreaterThan(9.5);
    expect(years).toBeLessThan(10.5);
    expect(criteria.maxResults).toBe(250);
  });
});
