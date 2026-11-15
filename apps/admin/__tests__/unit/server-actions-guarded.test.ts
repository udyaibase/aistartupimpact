import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * A server action is a public POST endpoint: Next.js runs it for anyone who sends its id, whatever page they are on.
 * So every exported action must check the session itself. This test fails when one doesn't.
 */

const ROOT = join(__dirname, '..', '..');
const GUARD = /\b(requireActionAuth|requireApiAuth|getServerSession|verifyAdmin|viewer|requireRole|canDelete)\s*\(/;

/** Exports that touch no data and need no session. Keep this list short and explain each entry. */
const ALLOWED: Record<string, string[]> = {
  // Pure role check used by the editor UI; reads nothing.
  'app/(dashboard)/articles/actions.ts': ['canPublishRole'],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

function unguarded(): string[] {
  const missing: string[] = [];
  for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]) {
    const src = readFileSync(file, 'utf8');
    if (!/^\s*['"]use server['"]/.test(src)) continue; // whole-file server actions only
    const rel = relative(ROOT, file);
    const parts = src.split(/^(?=export async function )/m).slice(1);
    for (const part of parts) {
      const name = part.match(/^export async function (\w+)/)![1];
      if (ALLOWED[rel]?.includes(name)) continue;
      if (!GUARD.test(part)) missing.push(`${rel}: ${name}`);
    }
  }
  return missing;
}

describe('admin server actions', () => {
  it('every exported action checks the session', () => {
    expect(unguarded()).toEqual([]);
  });
});
