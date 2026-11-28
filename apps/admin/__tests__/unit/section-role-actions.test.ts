import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SECTION_ROLES } from '@/lib/section-access';

const ROOT = join(__dirname, '../..');
const DASH = join(ROOT, 'app/(dashboard)');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const DEFAULT_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'];

// The directory listing carries each entry's type, so nothing is checked first and opened later (no stat-then-read race).
function serverActionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) serverActionFiles(p, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name) && /^\s*['"]use server['"]/.test(readFileSync(p, 'utf8'))) out.push(p);
  }
  return out;
}

/**
 * Server actions can be called directly, whatever the menu shows. An action that checks only the default roles
 * (which include senior writers) inside a section meant for editors would let a senior writer read or change
 * things the section hides from them. This once exposed a founder's personal details.
 */
describe('actions in a restricted section check that section’s roles', () => {
  it('no action falls back to the wider default roles inside a stricter section', () => {
    const keys = Object.keys(SECTION_ROLES).sort((a, b) => b.length - a.length);
    const loose: string[] = [];
    for (const file of serverActionFiles(DASH)) {
      const path = '/' + relative(DASH, join(file, '..')).split('\\').join('/');
      const key = keys.find((k) => path === k || path.startsWith(`${k}/`));
      if (!key) continue;
      const stricter = DEFAULT_ROLES.some((r) => !SECTION_ROLES[key].includes(r));
      if (!stricter) continue;
      const text = readFileSync(file, 'utf8');
      for (const fn of text.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)(?=\nexport |$)/g)) {
        if (/require(Action|Form)Auth\(\s*\)/.test(fn[2])) loose.push(`${relative(ROOT, file)} :: ${fn[1]}`);
      }
    }
    expect(loose).toEqual([]);
  });

  it('a founder’s profile and the employer network settings use their own section’s roles', () => {
    expect(src('app/(dashboard)/founders/[id]/actions.ts')).toContain("requireActionAuth(sectionRoles('/founders'))");
    const network = src('app/(dashboard)/employers/network-actions.ts');
    expect(network).toContain("const ROLES = sectionRoles('/employers');");
    expect(network.match(/requireActionAuth\(ROLES\)/g)?.length).toBe(3);
  });
});

describe('older actions that read the session themselves', () => {
  it('every one of them still checks the role (a revoked or half-signed-in session carries none)', () => {
    const missing: string[] = [];
    for (const file of serverActionFiles(DASH)) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('getServerSession(authOptions)')) continue;
      for (const fn of text.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)(?=\nexport |$)/g)) {
        if (fn[2].includes('getServerSession(authOptions)') && !/\.role|includes\(|isPublisher|canDelete|canOpen/.test(fn[2])) missing.push(`${relative(ROOT, file)} :: ${fn[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('who decides a founder’s submission', () => {
  it('only an editor: other staff may approve only listings our own team added', () => {
    for (const file of ['lib/startup-review.ts', 'lib/tool-review.ts']) {
      const text = src(file);
      expect(text).toContain("const REVIEWER_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];");
      expect(text).toMatch(/\.ownerId && admin\.role && !REVIEWER_ROLES\.includes\(admin\.role\)/);
    }
    // Every caller says who is asking.
    for (const file of ['app/(dashboard)/startups-dir/actions.ts', 'app/(dashboard)/tools-dir/actions.ts', 'app/(dashboard)/tools-dir/tool-bulk-actions.ts', 'app/(dashboard)/startups-dir/review/actions.ts']) {
      expect(src(file)).not.toContain('{ email: session?.user?.email }');
    }
  });
  it('a refused tool decision is not reported as done', () => {
    expect(src('app/api/admin/tools/[id]/reject/route.ts')).toContain('if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });');
  });
});
