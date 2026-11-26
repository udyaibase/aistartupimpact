import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * $queryRawUnsafe / $executeRawUnsafe send their text to the database as-is. Values must travel as parameters
 * ($1, $2…), never be written into the text, or a value could change the query.
 */
const ROOTS = ['app', 'lib'];
const CALL = /\$(?:queryRawUnsafe|executeRawUnsafe)(?:<[^>]*>)?\(\s*(`(?:[^`\\]|\\.)*`|[^,)]*)/g;
/** The one allowed splice: a list of "$1, $2, …" markers built from a fixed list of keys. */
const ALLOWED = /\$\{placeholders\}/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('raw SQL', () => {
  it('never splices a value into an unsafe query', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(files)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(CALL)) {
        const query = match[1];
        const literal = /^[`'"]/.test(query);
        if (!literal || query.replace(ALLOWED, '').includes('${')) offenders.push(`${file}: ${query.slice(0, 80).replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
