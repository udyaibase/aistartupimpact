// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const upload = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u1', role: 'SUPER_ADMIN' } } }) }));
vi.mock('next/link', () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }));
vi.mock('@/app/(dashboard)/articles/actions', () => ({
  uploadMediaAction: (fd: FormData) => upload(fd),
  saveArticleAction: vi.fn(async () => ({ success: true, data: { id: 'a1' } })),
  getArticleByIdAction: vi.fn(async () => ({ success: false })),
  getCategoriesAction: vi.fn(async () => ({ success: true, data: [] })),
}));
vi.mock('@/components/SelectionToolbar', () => ({ default: () => null }));
vi.mock('@/components/MediaPicker', () => ({ default: () => null }));
vi.mock('@/components/SEOScorePanel', () => ({ default: () => null }));
vi.mock('@/components/ImageAltTextManager', () => ({ default: () => null }));
vi.mock('@/components/useEditorMentions', () => ({ useEditorMentions: () => ({ checkForMention: () => {}, popup: null }) }));

import ArticleEditor from '@/app/(dashboard)/articles/ArticleEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLElement;
async function render(ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(ui); });
  return { container: host };
}
function cleanup() { act(() => root?.unmount()); root = null; host?.remove(); }
async function fire(el: Element, type: string, init: Record<string, unknown>) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries(init)) Object.defineProperty(ev, k, { value: v });
  await act(async () => { el.dispatchEvent(ev); });
}
async function waitFor(check: () => void, ms = 1500) {
  const end = Date.now() + ms;
  for (;;) {
    try { return check(); } catch (e) { if (Date.now() > end) throw e; }
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], 'cover.png', { type: 'image/png' });
const dataTransfer = (files: File[]) => ({ types: ['Files'], files, dropEffect: 'none' });

beforeEach(() => {
  upload.mockReset();
  upload.mockResolvedValue({ success: true, data: { url: 'https://media.udyaibase.com/uploads/cover.png' } });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  document.execCommand = vi.fn(() => true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const coverBox = (c: HTMLElement) => Array.from(c.querySelectorAll('button')).find((b) => /Add a cover image/.test(b.textContent || ''))!;

describe('article editor image drag and drop', () => {
  it('uploads an image dropped on the cover box and shows it as the cover', async () => {
    const { container } = await render(<ArticleEditor />);
    const box = coverBox(container);
    const file = png();

    await fire(box, 'dragenter', { dataTransfer: dataTransfer([file]) });
    expect(box.textContent).toContain('Drop to upload');

    await fire(box, 'drop', { dataTransfer: dataTransfer([file]) });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect((upload.mock.calls[0][0] as FormData).get('file')).toBe(file); // small file goes up unchanged
    await waitFor(() => expect(container.querySelector('img[alt="Cover"]')?.getAttribute('src')).toBe('https://media.udyaibase.com/uploads/cover.png'));
  });

  it('rejects a non-image file without uploading', async () => {
    const { container } = await render(<ArticleEditor />);
    const pdf = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' });
    await fire(coverBox(container), 'drop', { dataTransfer: dataTransfer([pdf]) });
    expect(upload).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('JPG, PNG'));
  });

  it('inserts an image dropped into the article body', async () => {
    const { container } = await render(<ArticleEditor />);
    const body = container.querySelector('[contenteditable]')!;
    await fire(body, 'dragenter', { dataTransfer: dataTransfer([png()]) });
    expect(container.textContent).toContain('Drop to insert the image here');

    await fire(body, 'drop', { dataTransfer: dataTransfer([png()]), clientX: 10, clientY: 10 });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith('insertHTML', false, expect.stringContaining('https://media.udyaibase.com/uploads/cover.png')));
  });

  it('ignores drags that carry no files (e.g. moving text)', async () => {
    const { container } = await render(<ArticleEditor />);
    const box = coverBox(container);
    await fire(box, 'dragenter', { dataTransfer: { types: ['text/plain'], files: [] } });
    expect(box.textContent).not.toContain('Drop to upload');
  });
});
