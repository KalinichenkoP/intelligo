import { LegalCase } from '../legal-data-provider/interfaces/legal-data-provider.interface';
import { LegalResultsService } from './legal-results.service';
import { EntityResolverService } from './entity-resolver.service';
import { SearchQueueService } from '../search-queue/search-queue.service';

describe('LegalResultsService.sortCases', () => {
  const service = new LegalResultsService(
    {} as EntityResolverService,
    {} as SearchQueueService,
  );

  const cases: LegalCase[] = [
    {
      docket: '1',
      court: 'United States Tax Court',
      title: 'Uncategorized old',
      dateFiled: '2020-01-01',
      link: '',
      resultType: 'docket',
      courtType: 'UNCATEGORIZED',
    },
    {
      docket: '2',
      court: 'Florida Middle District Court',
      title: 'Federal older',
      dateFiled: '2021-06-01',
      link: '',
      resultType: 'docket',
      courtType: 'FEDERAL',
    },
    {
      docket: '3',
      court: 'Florida Middle District Court',
      title: 'Federal newer',
      dateFiled: '2023-01-01',
      link: '',
      resultType: 'docket',
      courtType: 'FEDERAL',
    },
    {
      docket: '4',
      court: 'Connecticut State, Superior Court',
      title: 'State missing date',
      dateFiled: null,
      link: '',
      resultType: 'docket',
      courtType: 'STATE',
    },
    {
      docket: '5',
      court: 'Connecticut State, Superior Court',
      title: 'State dated',
      dateFiled: '2022-01-01',
      link: '',
      resultType: 'docket',
      courtType: 'STATE',
    },
    {
      docket: '6',
      court: 'Ohio State, Hamilton County, Court of Common Pleas',
      title: 'County',
      dateFiled: '2024-01-01',
      link: '',
      resultType: 'docket',
      courtType: 'COUNTY',
    },
  ];

  it('sorts by court priority then date descending with nulls last', () => {
    const sorted = service.sortCases(cases);
    expect(sorted.map((c) => c.docket)).toEqual([
      '3', // FEDERAL newest
      '2', // FEDERAL older
      '5', // STATE dated
      '4', // STATE missing date last in STATE bucket
      '6', // COUNTY
      '1', // UNCATEGORIZED
    ]);
  });
});
