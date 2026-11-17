/** Minimal iCalendar (.ics) builder for one or more sessions. Client-safe. */
export type IcsItem = { uid: string; title: string; description?: string; start: Date; end: Date; location?: string; url?: string };

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Lines longer than 75 octets are folded, as the spec requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ` ${rest.slice(74)}`; }
  out.push(rest);
  return out.join('\r\n');
}

export function buildIcs(items: IcsItem[], name = 'Udyaibase Events'): string {
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Udyaibase//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.uid}@udyaibase.com`, `DTSTAMP:${now}`, `DTSTART:${stamp(it.start)}`, `DTEND:${stamp(it.end)}`, `SUMMARY:${esc(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    if (it.location) lines.push(`LOCATION:${esc(it.location)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}

export function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
