// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

vi.mock('@/components/shared/TurnstileWidget', () => ({ default: () => null }));
import CandidateSignIn from '@/components/jobs/CandidateSignIn';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('Code sign-in with the 6 boxes', () => {
  it('signs in automatically on the 6th digit; a wrong code shows red until they type again', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (body.action === 'send') return new Response(JSON.stringify({ success: true }), { status: 200 });
      if (body.code === '111111') return new Response(JSON.stringify({ error: 'That code isn’t right. 2 tries left.', field: 'code' }), { status: 400 });
      return new Response(JSON.stringify({ success: true, redirect: '/my-applications' }), { status: 200 });
    }));
    const el = document.createElement('div');
    document.body.innerHTML = ''; document.body.appendChild(el);
    act(() => { createRoot(el).render(<CandidateSignIn returnTo="/jobs" startWithEmail compact initialEmail="kavya@x.co" />); });
    await act(async () => { el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    const boxes = () => [...el.querySelectorAll('[role="group"] input')] as HTMLInputElement[];
    const type = async (chars: string) => { for (const ch of chars) { const b = document.activeElement as HTMLInputElement; await act(async () => { setter.call(b, ch); b.dispatchEvent(new Event('input', { bubbles: true })); }); } };
    expect(boxes()).toHaveLength(6);
    expect(document.activeElement).toBe(boxes()[0]);

    await type('111111'); await flush();
    expect(calls.filter((c) => c.action === 'verify')).toHaveLength(1);
    expect(boxes().every((b) => b.value === '' && b.className.includes('border-red-500'))).toBe(true);
    expect(el.textContent).toContain('2 tries left');

    await type('5');
    expect(boxes()[0].className).not.toContain('border-red-500');
    await type('63877'); await flush();
    const verifies = calls.filter((c) => c.action === 'verify');
    expect(verifies).toHaveLength(2);
    expect(verifies[1].code).toBe('563877');
  });
});
