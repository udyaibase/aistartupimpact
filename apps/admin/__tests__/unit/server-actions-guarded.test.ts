import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * A server action is a public POST endpoint: Next.js runs it for anyone who sends its id, whatever page they are on.
 * So every exported action must check the session itself. This test fails when one doesn't.
 */

const ROOT = join(__dirname, '..', '..');
const GUARD = /\b(requireActionAuth|requireFormAuth|requireApiAuth|getServerSession|verifyAdmin|viewer|requireRole|canDelete)\s*\(/;

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

/**
 * Actions written inside a page file: `async function save(formData) { 'use server'; ... }`.
 * The check has to be the first thing the action does, so it must appear within a few lines of the directive.
 */
function unguardedInline(): string[] {
  const missing: string[] = [];
  for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'components'))]) {
    const src = readFileSync(file, 'utf8');
    if (/^\s*['"]use server['"]/.test(src)) continue; // whole-file actions are covered above
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (!/^\s+['"]use server['"];?\s*$/.test(line)) return;
      const start = lines.slice(i + 1, i + 6).join('\n');
      if (!GUARD.test(start)) missing.push(`${relative(ROOT, file)}: line ${i + 1}`);
    });
  }
  return missing;
}

describe('admin server actions', () => {
  it('every exported action checks the session', () => {
    expect(unguarded()).toEqual([]);
  });

  it('every action written inside a page checks the session first', () => {
    expect(unguardedInline()).toEqual([]);
  });
});
