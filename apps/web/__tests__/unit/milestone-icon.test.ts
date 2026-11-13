import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MilestoneIcon, milestoneType } from '@/components/milestones/MilestoneIcon';

const EMOJI = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const TYPES = ['FUNDING', 'LAUNCH', 'PARTNERSHIP', 'ACQUISITION', 'AWARD', 'HIRING', 'REVENUE', 'USER_MILESTONE'];

describe('MilestoneIcon', () => {
  it('renders an SVG icon (no emoji) with a label for every milestone type', () => {
    const labels = new Set<string>();
    for (const type of TYPES) {
      const html = renderToStaticMarkup(createElement(MilestoneIcon, { type }));
      expect(html.startsWith('<svg')).toBe(true);
      expect(html).not.toMatch(EMOJI);
      expect(html).toContain(`aria-label="${milestoneType(type).label}"`);
      labels.add(milestoneType(type).label);
    }
    expect(labels.size).toBe(TYPES.length); // each type has its own icon/label
  });

  it('falls back to a generic milestone icon for unknown types', () => {
    expect(milestoneType('SOMETHING_NEW').label).toBe('Milestone');
    expect(milestoneType(null).label).toBe('Milestone');
    expect(renderToStaticMarkup(createElement(MilestoneIcon, { type: undefined }))).toContain('aria-label="Milestone"');
  });
});
