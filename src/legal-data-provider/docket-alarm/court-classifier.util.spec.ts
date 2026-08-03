import { classifyCourt, courtTypePriority } from './court-classifier.util';

describe('classifyCourt', () => {
  it('classifies all seven assignment examples correctly', () => {
    expect(classifyCourt('Florida Middle District Court')).toBe('FEDERAL');
    expect(classifyCourt('U.S. Court of Appeals, Second Circuit')).toBe('FEDERAL');
    expect(classifyCourt('Nevada Bankruptcy Court')).toBe('FEDERAL');
    expect(classifyCourt('Connecticut State, Superior Court')).toBe('STATE');
    expect(classifyCourt('Ohio State, Hamilton County, Court of Common Pleas')).toBe(
      'COUNTY',
    );
    expect(
      classifyCourt('Pennsylvania State, Magisterial District Court, Chester County'),
    ).toBe('COUNTY');
    expect(classifyCourt('United States Tax Court')).toBe('UNCATEGORIZED');
  });

  it('falls back to UNCATEGORIZED for unrecognized courts', () => {
    expect(classifyCourt('Some Unknown Tribunal')).toBe('UNCATEGORIZED');
    expect(classifyCourt('')).toBe('UNCATEGORIZED');
  });

  it('orders priorities FEDERAL < STATE < COUNTY < UNCATEGORIZED', () => {
    expect(courtTypePriority('FEDERAL')).toBeLessThan(courtTypePriority('STATE'));
    expect(courtTypePriority('STATE')).toBeLessThan(courtTypePriority('COUNTY'));
    expect(courtTypePriority('COUNTY')).toBeLessThan(courtTypePriority('UNCATEGORIZED'));
  });
});
