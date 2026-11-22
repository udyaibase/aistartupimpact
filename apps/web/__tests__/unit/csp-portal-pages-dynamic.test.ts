import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { isPortalPath } from '@/lib/csp';

/**
 * Pages under /founder, /employer and /organizer get a CSP with a per-request nonce. A page Next.js pre-builds as static
 * HTML can't carry that nonce, so its scripts would be blocked in production (development always renders per request,
 * so it wouldn't show there). Every such page must have a layout (or itself) that calls connection().
 */
const APP = join(process.cwd(), 'app');

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'api' ? [] : pages(p);
    return name === 'page.tsx' ? [p] : [];
  });
}

/** URL of a page file: route groups "(x)" don't appear in the URL. */
const urlOf = (file: string) => '/' + relative(APP, file).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).join('/');

function rendersPerRequest(file: string): boolean {
  let dir = file.slice(0, file.lastIndexOf(sep));
  if (/await connection\(\)/.test(readFileSync(file, 'utf8'))) return true;
  while (dir.startsWith(APP)) {
    const layout = join(dir, 'layout.tsx');
    if (existsSync(layout) && /await connection\(\)/.test(readFileSync(layout, 'utf8'))) return true;
    if (dir === APP) break;
    dir = dir.slice(0, dir.lastIndexOf(sep));
  }
  return false;
}

describe('portal pages render per request (so their CSP nonce works)', () => {
  it('every page under /founder, /employer and /organizer has connection() in itself or a layout above it', () => {
    const portalPages = pages(APP).filter((f) => isPortalPath(urlOf(f)));
    expect(portalPages.length).toBeGreaterThan(50);
    const missing = portalPages.filter((f) => !rendersPerRequest(f)).map((f) => relative(APP, f));
    expect(missing).toEqual([]);
  });
});
