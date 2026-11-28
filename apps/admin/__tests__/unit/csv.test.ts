import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/lib/csv';

describe('CSV cells', () => {
  it('turns a value that would run as a formula into plain text', () => {
    for (const v of ['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\t=1+1', '\r=1+1']) expect(csvCell(v).startsWith(`"'`)).toBe(true);
  });
  it('leaves ordinary values alone, quoted', () => {
    expect(csvCell('Asha Rao')).toBe('"Asha Rao"');
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell('a-b@c.in')).toBe('"a-b@c.in"');
  });
  it('doubles quotes so a value cannot break out of its cell', () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
  });
  it('builds a file from a header row and data rows', () => {
    expect(toCsv(['Name', 'Company'], [['Asha', '=cmd'], ['Ravi', 'Acme, Inc']])).toBe('"Name","Company"\n"Asha","\'=cmd"\n"Ravi","Acme, Inc"');
  });
});
