/**
 * Compact wire format for /api/tools/directory (the full /tools list, loaded when a visitor searches or filters).
 *
 * The plain JSON repeated every field name on 1,400+ tools, sent each of ~6,000 filter tags with fields the page
 * never reads, and wrote every tool→tag link as a 36-character id. This format sends:
 *   - tools as rows under one list of column names,
 *   - each tag once as [id, name, slug],
 *   - tool→tag links as small numbers (positions in the tag list).
 * `decodeDirectory` rebuilds exactly the objects the page used before, with the same tag ids, so tags picked from
 * the first-load data keep matching after the full list arrives. No imports: safe for server and browser.
 */

type Row = Record<string, unknown>;

export interface DirectoryTag {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
  groupId: string;
  sortOrder: number;
  tagCount: number;
}

export interface DirectoryTagGroup {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sortOrder: number;
  displayMode: string;
  maxVisibleDefault: number;
  tags: DirectoryTag[];
}

export interface DirectoryData<T extends Row = Row> {
  tools: T[];
  toolTagMap: Record<string, string[]>;
  tagGroups: DirectoryTagGroup[];
}

export interface DirectoryWire {
  v: 2;
  /** Tool field names; each row lists values in this order. */
  cols: string[];
  rows: unknown[][];
  /** Tag groups without their tags' unused fields; tags are [id, name, slug]. */
  groups: (Omit<DirectoryTagGroup, 'tags'> & { tags: [string, string, string][] })[];
  /** Per row: positions of the tool's tags in the flattened tag list (groups in order, then tags in order). */
  tags: number[][];
}

export function encodeDirectory(data: DirectoryData): DirectoryWire {
  const cols = data.tools.length ? Object.keys(data.tools[0]) : [];
  const position = new Map<string, number>();
  const groups = data.tagGroups.map(({ tags, ...group }) => ({
    ...group,
    tags: tags.map((t): [string, string, string] => {
      position.set(t.id, position.size);
      return [t.id, t.name, t.slug];
    }),
  }));
  return {
    v: 2,
    cols,
    rows: data.tools.map((tool) => cols.map((c) => tool[c] ?? null)),
    groups,
    tags: data.tools.map((tool) =>
      (data.toolTagMap[String(tool.id)] ?? []).map((id) => position.get(id)).filter((n): n is number => n !== undefined),
    ),
  };
}

/** Accepts the compact format, or the older plain one (an edge-cached response from before a deploy). */
export function decodeDirectory<T extends Row = Row>(payload: unknown): DirectoryData<T> | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Partial<DirectoryWire> & Partial<DirectoryData<T>>;
  if (p.v !== 2) {
    return Array.isArray(p.tools) ? { tools: p.tools, toolTagMap: p.toolTagMap ?? {}, tagGroups: p.tagGroups ?? [] } : null;
  }
  const cols = p.cols ?? [];
  const tools = (p.rows ?? []).map((row) => {
    const tool: Row = {};
    cols.forEach((c, i) => { tool[c] = row[i]; });
    return tool as T;
  });
  const flatIds: string[] = [];
  const tagGroups: DirectoryTagGroup[] = (p.groups ?? []).map(({ tags, ...group }) => ({
    ...group,
    tags: tags.map(([id, name, slug], i) => {
      flatIds.push(id);
      return { id, name, slug, emoji: null, groupId: group.id, sortOrder: i + 1, tagCount: 0 };
    }),
  }));
  const toolTagMap: Record<string, string[]> = {};
  (p.tags ?? []).forEach((positions, i) => {
    const tool = tools[i];
    if (tool && positions.length) toolTagMap[String(tool.id)] = positions.map((n) => flatIds[n]).filter(Boolean);
  });
  return { tools, toolTagMap, tagGroups };
}
