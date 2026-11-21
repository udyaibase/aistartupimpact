// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FormProblemList, SectionLinks, findFormProblems, useFormProblems } from '@/components/ui/FormProblems';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = () => {}; // not implemented in the test DOM

let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(ui: React.ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(ui); });
  return host;
}
afterEach(() => { act(() => { root?.unmount(); }); host?.remove(); root = null; host = null; });

const byText = (el: HTMLElement, text: string) => [...el.querySelectorAll<HTMLElement>('button, a')].find((n) => n.textContent === text)!;
const click = (el: HTMLElement) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
/** Sets a field's value the way a person typing would (React listens for the input event). */
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  act(() => { el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
}

function Form({ onSave }: { onSave: () => void }) {
  const problems = useFormProblems();
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (problems.check(e.currentTarget)) onSave(); }}>
      <FormProblemList problems={problems.problems} onJump={problems.jumpTo} />
      <label htmlFor="name">Company Name *</label>
      <input id="name" name="name" required defaultValue="" />
      <label htmlFor="tagline">Tagline * (23 characters remaining) 37 / 60</label>
      <input id="tagline" name="tagline" required defaultValue="Crop advice" />
      <label htmlFor="site">Website URL *</label>
      <input id="site" name="websiteUrl" type="url" required defaultValue="not a url" />
      <select aria-label="Category" required defaultValue=""><option value="">Select</option><option value="a">AgriTech</option></select>
      <input type="hidden" name="token" />
      <button type="submit">Save changes</button>
    </form>
  );
}

describe('form error list', () => {
  it('lists every problem at once, in page order, with plain messages', () => {
    const onSave = vi.fn();
    const el = mount(<Form onSave={onSave} />);
    click(byText(el, 'Save changes'));
    expect(onSave).not.toHaveBeenCalled();
    expect(el.querySelector('[role=alert]')!.textContent).toContain('Fix 3 fields to save');
    expect([...el.querySelectorAll('[role=alert] li')].map((li) => li.textContent)).toEqual([
      'Company Name is required',
      'Website URL must be a full web address, like https://example.com',
      'Category needs a choice',
    ]);
  });

  it('marks the bad fields for screen readers and moves focus to the first', () => {
    const el = mount(<Form onSave={vi.fn()} />);
    click(byText(el, 'Save changes'));
    expect(el.querySelector('#name')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('#tagline')!.getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('#name'));
  });

  it('clears a mark once the field is fixed, and saves when nothing is wrong', () => {
    const onSave = vi.fn();
    const el = mount(<Form onSave={onSave} />);
    click(byText(el, 'Save changes'));
    type(el.querySelector<HTMLInputElement>('#name')!, 'Krishi Mitra AI');
    type(el.querySelector<HTMLInputElement>('#site')!, 'https://krishi.example');
    type(el.querySelector<HTMLSelectElement>('select')!, 'a');
    click(byText(el, 'Save changes'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.querySelector('#name')!.getAttribute('aria-invalid')).toBeNull();
  });

  it('the label is cleaned of the star and the character counter', () => {
    const el = mount(<form><label htmlFor="t">Tagline * (23 characters remaining) 37 / 60</label><input id="t" required defaultValue="" /></form>);
    expect(findFormProblems(el.querySelector('form')!)[0]).toMatchObject({ label: 'Tagline', message: 'is required' });
  });

  it('section links point at sections of the page', () => {
    const el = mount(<SectionLinks label="Parts of this form" sections={[{ id: 'startup-basics', label: 'Basics' }, { id: 'startup-funding', label: 'Funding' }]} />);
    expect(el.querySelector('nav')!.getAttribute('aria-label')).toBe('Parts of this form');
    expect(byText(el, 'Funding').getAttribute('href')).toBe('#startup-funding');
  });
});

describe('founder portal screens', () => {
  const ROOT = resolve(__dirname, '../../app/founder');
  const pages = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? pages(p) : name === 'page.tsx' ? [p] : [];
  });
  /** A page has a title when it, or a layout between it and the portal root, sets one. */
  const hasTitle = (page: string): boolean => {
    if (/export const metadata|generateMetadata/.test(readFileSync(page, 'utf8'))) return true;
    for (let dir = join(page, '..'); dir.startsWith(ROOT) && dir !== ROOT; dir = join(dir, '..')) {
      const layout = join(dir, 'layout.tsx');
      if (existsSync(layout) && /export const metadata/.test(readFileSync(layout, 'utf8'))) return true;
    }
    return false;
  };

  it('every screen sets its own browser-tab title', () => {
    // /founder itself only redirects to the dashboard; the catch-all only answers "not found".
    const skip = [join(ROOT, 'page.tsx'), join(ROOT, '[...missing]', 'page.tsx')];
    const untitled = pages(ROOT).filter((p) => !skip.includes(p) && !hasTitle(p)).map((p) => p.slice(ROOT.length));
    expect(untitled).toEqual([]);
  });

  it('a wrong address inside the portal has its own "not found" page with a way back', () => {
    const notFound = readFileSync(join(ROOT, 'not-found.tsx'), 'utf8');
    expect(notFound).toContain('/founder/dashboard');
    expect(existsSync(join(ROOT, '[...missing]', 'page.tsx'))).toBe(true);
  });

  it('Content is in the side menu', () => {
    expect(readFileSync(resolve(__dirname, '../../components/founder/FounderSidebar.tsx'), 'utf8')).toMatch(/label: 'Content', href: '\/founder\/content'/);
  });

  it('the funding round list says "Angel", not "Angle"', () => {
    const src = readFileSync(resolve(__dirname, '../../components/shared/FundingRoundsManager.tsx'), 'utf8');
    expect(src).toContain("'Angel'");
    expect(src).not.toMatch(/'Pre-Seed', 'Angle'/);
  });
});
