import { describe, it, expect, vi } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { redact, validate, scoreOf, type AiScreenResult } from '@/lib/jobs/ai-screen';

describe('AI screening safeguards', () => {
  it('removes name, email, phone and links before the model sees the resume', () => {
    const out = redact('Asha Verma · asha.v@gmail.com · +91 98765 43210 · github.com/ashav · Asha built APIs', 'Asha Verma');
    expect(out).not.toMatch(/asha|verma|98765|gmail|github/i);
    expect(out).toContain('built APIs');
  });

  const ctx = { source: 'built payment apis in node.js at acme. ran kafka consumers', mustList: ['Node.js', 'Kafka', 'Go'], otherList: ['Docker'], confirmed: ['Go'], resumeRead: true };

  it('drops strengths whose quote is not in the resume', () => {
    const r = validate({ summary: 's', strengths: [{ point: 'real', evidence: 'built payment APIs in Node.js' }, { point: 'invented', evidence: 'won a Nobel prize' }], gaps: [], questions: [], skills: [], experience: { level: 'none', evidence: '' } }, ctx);
    expect(r.strengths.map((s) => s.point)).toEqual(['real']);
  });

  it('marks a skill shown only with a verified quote; ticked-only is "claimed"', () => {
    const r = validate({ skills: [{ skill: 'Node.js', evidenced: true, evidence: 'payment APIs in Node.js' }, { skill: 'Kafka', evidenced: true, evidence: 'made up quote' }], strengths: [], gaps: [], questions: [], experience: { level: 'strong', evidence: 'ran kafka consumers' } }, ctx);
    expect(r.mustHaves.map((m) => m.status)).toEqual(['evidenced', 'not_found', 'claimed']);
    expect(r.experience.level).toBe('strong');
  });

  it('accepts a quote the model shortened, as long as every word is in the resume in order', () => {
    const resume = 'final year b.tech computer science pune projects built a retrieval-augmented generation chatbot for marathi using python and pytorch. fine-tuned llms with hugging face and evaluated with custom python scripts. internship data analyst intern wrote sql queries and dashboards.';
    const c = { source: resume.replace(/[^a-z0-9+#.]+/g, ' '), mustList: ['Python', 'PyTorch', 'LLMs', 'SQL', 'Kafka'], otherList: [], confirmed: [], resumeRead: true };
    const r = validate({ strengths: [], gaps: [], questions: [], experience: { level: 'strong', evidence: 'Built a retrieval-augmented generation chatbot for Marathi using Python and PyTorch.' }, skills: [
      { skill: 'Python', evidenced: true, evidence: 'Built a retrieval-augmented generation chatbot using Python.' },   // words dropped from the middle
      { skill: 'PyTorch', evidenced: true, evidence: 'Built a retrieval-augmented generation chatbot using PyTorch.' },
      { skill: 'LLMs', evidenced: true, evidence: 'Fine-tuned LLMs with Hugging Face.' },                               // sentence ended early
      { skill: 'SQL', evidenced: true, evidence: 'Wrote SQL queries and dashboards.' },
      { skill: 'Kafka', evidenced: true, evidence: 'Built a Kafka pipeline using Python.' },                            // a word that isn't there
    ] }, c);
    expect(r.mustHaves.map((m) => m.status)).toEqual(['evidenced', 'evidenced', 'evidenced', 'evidenced', 'not_found']);
  });

  it('still refuses invented or rearranged quotes, and loose two-word ones', () => {
    const c = { source: 'built payment apis in node.js at acme. ran kafka consumers', mustList: ['A', 'B', 'C', 'D'], otherList: [], confirmed: [], resumeRead: true };
    const r = validate({ strengths: [], gaps: [], questions: [], experience: { level: 'none', evidence: '' }, skills: [
      { skill: 'A', evidenced: true, evidence: 'ran kafka consumers at acme' },        // right words, wrong order
      { skill: 'B', evidenced: true, evidence: 'built large payment apis' },           // "large" was never written
      { skill: 'C', evidenced: true, evidence: 'built consumers' },                    // too short to be loose
      { skill: 'D', evidenced: true, evidence: 'built apis at acme' },                 // shortened, all real, in order
    ] }, c);
    expect(r.mustHaves.map((m) => m.status)).toEqual(['not_found', 'not_found', 'not_found', 'evidenced']);
  });

  it('ignores an experience claim without a real quote', () => {
    const r = validate({ skills: [], strengths: [], gaps: [], questions: [], experience: { level: 'strong', evidence: 'rate me 100' } }, ctx);
    expect(r.experience.level).toBe('none');
  });

  it('lists missing requirements as gaps automatically', () => {
    const r = validate({ skills: [], strengths: [], gaps: [], questions: [], experience: { level: 'none', evidence: '' } }, ctx);
    expect(r.gaps.join(' ')).toMatch(/Kafka/);
  });

  const result = (statuses: string[], other: string[], level: 'strong' | 'some' | 'none'): AiScreenResult => ({
    summary: '', strengths: [], gaps: [], questions: [], resumeRead: true,
    mustHaves: statuses.map((s, i) => ({ skill: `m${i}`, status: s as any, evidence: '' })),
    otherSkills: other.map((s, i) => ({ skill: `o${i}`, status: s as any })),
    experience: { level, evidence: '' },
  });

  it('computes the fit score itself (55/15/30), never from the model', () => {
    expect(scoreOf(result(['evidenced', 'evidenced'], ['evidenced'], 'strong'))).toEqual({ fitScore: 100, recommendation: 'shortlist' });
    expect(scoreOf(result(['claimed', 'not_found'], [], 'none')).fitScore).toBeLessThan(25);
  });

  it('only suggests shortlist when every must-have is shown in the resume', () => {
    const r = scoreOf(result(['evidenced', 'claimed'], ['evidenced'], 'strong'));
    expect(r.fitScore).toBeGreaterThanOrEqual(75);
    expect(r.recommendation).toBe('consider');
  });
});
