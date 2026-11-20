// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CodeInput from '@/components/ui/CodeInput';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Like the sign-in form: a wrong code sets `invalid` and clears the boxes; typing again clears `invalid`. */
function Harness({ onComplete, wrong }: { onComplete: (v: string) => void; wrong?: string }) {
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <CodeInput value={code} invalid={invalid}
      onChange={(v) => { setCode(v); if (invalid) setInvalid(false); }}
      onComplete={(v) => { onComplete(v); if (v === wrong) { setInvalid(true); setCode(''); } }} />
  );
}

function mount(props: { onComplete: (v: string) => void; wrong?: string }) {
  const el = document.createElement('div');
  document.body.innerHTML = '';
  document.body.appendChild(el);
  act(() => { createRoot(el).render(<Harness {...props} />); });
  const boxes = () => [...el.querySelectorAll('input')] as HTMLInputElement[];
  const group = () => el.querySelector('[role="group"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  // Types one character into whichever box has focus, as a keyboard would.
  const type = (chars: string) => {
    for (const ch of chars) {
      const box = document.activeElement as HTMLInputElement;
      act(() => { setter.call(box, ch); box.dispatchEvent(new Event('input', { bubbles: true })); });
    }
  };
  return { boxes, group, type };
}

describe('CodeInput (6 boxes)', () => {
  it('moves to the next box as you type and fires onComplete once with the full code', () => {
    const done = vi.fn();
    const { boxes, type } = mount({ onComplete: done });
    act(() => { boxes()[0].focus(); });
    type('12345');
    expect(boxes().map((b) => b.value).join('')).toBe('12345');
    expect(document.activeElement).toBe(boxes()[5]);
    expect(done).not.toHaveBeenCalled();
    type('6');
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith('123456');
  });

  it('turns every box green when complete', () => {
    const { boxes, type } = mount({ onComplete: () => {} });
    act(() => { boxes()[0].focus(); });
    type('123456');
    expect(boxes().every((b) => b.className.includes('border-green-600') && b.className.includes('code-box-done'))).toBe(true);
  });

  it('fills every box from a paste (or phone autofill)', () => {
    const done = vi.fn();
    const { boxes } = mount({ onComplete: done });
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } };
    paste.clipboardData = { getData: () => ' 98-76 54 ' };
    act(() => { boxes()[0].focus(); boxes()[0].dispatchEvent(paste); });
    expect(boxes().map((b) => b.value).join('')).toBe('987654');
    expect(done).toHaveBeenCalledWith('987654');
  });

  it('a wrong code goes red, clears and refocuses; typing again goes back to normal', () => {
    const done = vi.fn();
    const { boxes, group, type } = mount({ onComplete: done, wrong: '111111' });
    act(() => { boxes()[0].focus(); });
    type('111111');
    expect(group().className).toContain('code-row-error');
    expect(boxes().every((b) => b.value === '' && b.className.includes('border-red-500'))).toBe(true);
    expect(document.activeElement).toBe(boxes()[0]);
    type('5');
    expect(group().className).not.toContain('code-row-error');
    expect(boxes()[0].className).not.toContain('border-red-500');
    type('63877');
    expect(done).toHaveBeenLastCalledWith('563877');
    expect(boxes().every((b) => b.className.includes('border-green-600'))).toBe(true);
  });

  it('Backspace on an empty box clears the previous one and moves back', () => {
    const { boxes, type } = mount({ onComplete: () => {} });
    act(() => { boxes()[0].focus(); });
    type('12');
    act(() => { boxes()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); });
    expect(boxes().map((b) => b.value).join('')).toBe('1');
    expect(document.activeElement).toBe(boxes()[1]);
  });
});
