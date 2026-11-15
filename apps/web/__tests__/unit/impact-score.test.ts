import { describe, it, expect } from 'vitest';
import { calculateImpactScore } from '@/lib/impact-score';

const currentYear = new Date().getFullYear();

describe('calculateImpactScore', () => {
  describe('total score', () => {
    it('returns 0 for all null/zero inputs', () => {
      const result = calculateImpactScore({
        totalFundingUsdCents: 0,
        employeeCount: null,
        stage: null,
        foundedYear: null,
      });
      expect(result.total).toBe(0);
    });

    it('returns max 100 for maximum inputs', () => {
      const result = calculateImpactScore({
        totalFundingUsdCents: 100_000_000_00, // $100M in cents
        employeeCount: 500,
        stage: 'PUBLIC',
        foundedYear: currentYear - 10,
      });
      expect(result.total).toBe(50 + 20 + 15 + 15);
    });

    it('returns correct breakdown structure', () => {
      const result = calculateImpactScore({
        totalFundingUsdCents: 1_000_000_00,
        employeeCount: 50,
        stage: 'SEED',
        foundedYear: currentYear - 3,
      });
      expect(result.funding.max).toBe(50);
      expect(result.employees.max).toBe(20);
      expect(result.stage.max).toBe(15);
      expect(result.age.max).toBe(15);
      expect(result.total).toBe(
        result.funding.score + result.employees.score + result.stage.score + result.age.score
      );
    });
  });

  describe('funding score', () => {
    it('returns 0 for $0', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBe(0);
    });

    it('returns ~10 for $100K', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 100_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBe(10);
    });

    it('returns ~20 for $1M', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 1_000_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBeGreaterThanOrEqual(19);
      expect(r.funding.score).toBeLessThanOrEqual(23);
    });

    it('returns score in 30-40 range for $10M', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 10_000_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBeGreaterThanOrEqual(30);
      expect(r.funding.score).toBeLessThanOrEqual(40);
    });

    it('caps at 50 for $100M+', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 500_000_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBe(50);
    });

    it('handles small amounts below $100K', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 10_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBeGreaterThan(0);
      expect(r.funding.score).toBeLessThan(10);
    });

    it('returns 0 for negative amounts', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: -100, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.score).toBe(0);
    });
  });

  describe('funding label', () => {
    it('shows "No funding data" for $0', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.label).toBe('No funding data');
    });

    it('shows B suffix for billions', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 2_000_000_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.label).toContain('B raised');
    });

    it('shows M suffix for millions', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 5_000_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.label).toContain('M raised');
    });

    it('shows K suffix for thousands', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 500_000_00, employeeCount: null, stage: null, foundedYear: null });
      expect(r.funding.label).toContain('K raised');
    });
  });

  describe('employee score', () => {
    it('returns 0 for null', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.employees.score).toBe(0);
    });

    it('returns 0 for 0 employees', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: 0, stage: null, foundedYear: null });
      expect(r.employees.score).toBe(0);
    });

    it('returns ~5 for 10 employees', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: 10, stage: null, foundedYear: null });
      expect(r.employees.score).toBeGreaterThanOrEqual(4);
      expect(r.employees.score).toBeLessThanOrEqual(8);
    });

    it('returns 20 for 500+ employees', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: 500, stage: null, foundedYear: null });
      expect(r.employees.score).toBe(20);
    });

    it('caps at 20 for 1000 employees', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: 1000, stage: null, foundedYear: null });
      expect(r.employees.score).toBe(20);
    });
  });

  describe('employee label', () => {
    it('shows "No team data" for null', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.employees.label).toBe('No team data');
    });

    it('shows "500+ employees" for >= 500', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: 600, stage: null, foundedYear: null });
      expect(r.employees.label).toBe('500+ employees');
    });

    it('shows count for normal values', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: 42, stage: null, foundedYear: null });
      expect(r.employees.label).toBe('42+ employees');
    });
  });

  describe('stage score', () => {
    const stages: [string, number][] = [
      ['IDEA', 1],
      ['PRE_SEED', 3],
      ['BOOTSTRAPPED', 4],
      ['SEED', 6],
      ['PRE_SERIES_A', 8],
      ['SERIES_A', 9],
      ['SERIES_B', 12],
      ['SERIES_C', 13],
      ['GROWTH', 14],
      ['PUBLIC', 15],
    ];

    it.each(stages)('returns %i for stage %s', (stage, expected) => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage, foundedYear: null });
      expect(r.stage.score).toBe(expected);
    });

    it('returns 0 for null stage', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.stage.score).toBe(0);
    });

    it('returns 0 for unknown stage', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: 'UNKNOWN', foundedYear: null });
      expect(r.stage.score).toBe(0);
    });
  });

  describe('stage label', () => {
    it('returns human-readable labels', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: 'PRE_SERIES_A', foundedYear: null });
      expect(r.stage.label).toBe('Pre-Series A');
    });

    it('returns "Unknown stage" for null', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.stage.label).toBe('Unknown stage');
    });
  });

  describe('age score', () => {
    it('returns 0 for null year', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.age.score).toBe(0);
    });

    it('returns 0 for current year', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: currentYear });
      expect(r.age.score).toBe(0);
    });

    it('returns score for 4 years old', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: currentYear - 4 });
      expect(r.age.score).toBe(Math.min(15, Math.round(4 * 1.875)));
    });

    it('caps at 15 for 8+ years', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: currentYear - 10 });
      expect(r.age.score).toBe(15);
    });

    it('returns 0 for future year', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: currentYear + 5 });
      expect(r.age.score).toBe(0);
    });
  });

  describe('age label', () => {
    it('returns "Founded year unknown" for null', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: null });
      expect(r.age.label).toBe('Founded year unknown');
    });

    it('returns singular "year" for 1 year old', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: currentYear - 1 });
      expect(r.age.label).toContain('1 year old');
    });

    it('returns plural "years" for 3 years old', () => {
      const r = calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage: null, foundedYear: currentYear - 3 });
      expect(r.age.label).toContain('3 years old');
    });
  });
});

describe('stage scores cover every StartupStage', () => {
  it('gives every stage in the schema a score above zero, never lower than an earlier round', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const schema = readFileSync(join(__dirname, '../../../../packages/database/prisma/schema.prisma'), 'utf8');
    const stages = schema.match(/enum StartupStage \{([^}]+)\}/)![1].trim().split(/\s+/);
    expect(stages.length).toBeGreaterThan(10);
    const score = (stage: string) => calculateImpactScore({ totalFundingUsdCents: 0, employeeCount: null, stage, foundedYear: null }).stage.score;
    for (const stage of stages) expect(score(stage), stage).toBeGreaterThan(0);
    // The enum lists funding rounds in order from PRE_SEED onwards.
    const rounds = stages.slice(stages.indexOf('PRE_SEED'));
    for (let i = 1; i < rounds.length; i++) expect(score(rounds[i]), rounds[i]).toBeGreaterThanOrEqual(score(rounds[i - 1]));
  });
});
