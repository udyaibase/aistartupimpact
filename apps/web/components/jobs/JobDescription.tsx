import React from 'react';

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Handle **bold** and *italic*
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-navy dark:text-white">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function isMarkdownHeading(line: string): { level: number; text: string } | null {
  const m = line.match(/^(#{1,3})\s+(.+)$/);
  if (!m) return null;
  let text = m[2].trim();
  // Strip wrapping **bold** from heading text
  text = text.replace(/^\*\*(.+)\*\*$/, '$1');
  return { level: m[1].length, text };
}

function isHeading(line: string): boolean {
  if (isMarkdownHeading(line)) return true;
  if (line.length > 80 || line.length < 4) return false;
  if (line.endsWith(':') && line.length < 60) return true;
  if (/^(about|what|who|why|how|role\b|responsibilities|requirements|qualifications|benefits|perks|compensation|nice\s+to\s+have|must[\s-]have|preferred|bonus|key\s|your\s|the\s+role|our\s|job\s|position|skills\s|we\s|team\b|apply|location|minimum|additional|desired|core\s|technical\s|equal|diversity|culture|mission|overview|summary|important|mandate)\b/i.test(line) && line.split(/\s+/).length <= 10) return true;
  if (/^(role\s*\d|step\s*\d)/i.test(line)) return true;
  const words = line.split(/\s+/);
  const wordCount = words.length;
  const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
  if (wordCount <= 6 && capitalizedWords >= wordCount * 0.5 && !line.endsWith('.') && !line.endsWith(',') && !/[\/()]/.test(line)) return true;
  return false;
}

function isBullet(line: string): boolean {
  return /^(\s*[-•●◦▪▸►→–—]\s|^\s*\d+[\.\)]\s|^\s*[a-zA-Z][\.\)]\s)/.test(line);
}

function stripBulletMarker(line: string): string {
  return line.replace(/^\s*[-•●◦▪▸►→–—]\s+/, '').replace(/^\s*\d+[\.\)]\s+/, '').replace(/^\s*[a-zA-Z][\.\)]\s+/, '');
}

function isHorizontalRule(line: string): boolean {
  return /^[-*_]{3,}\s*$/.test(line.trim());
}

function renderHeading(line: string, key: number | string): React.ReactElement {
  const md = isMarkdownHeading(line);
  const text = md ? md.text : line.trim().replace(/:$/, '');
  const cls = md && md.level === 1
    ? "font-sora font-bold text-base text-navy dark:text-white"
    : "font-sora font-bold text-sm text-navy dark:text-white";
  return <h3 key={key} className={cls}>{parseInline(text)}</h3>;
}

const LI_CLASS = "text-sm text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed pl-1";
const UL_CLASS = "list-disc list-outside pl-4 marker:text-brand/50";
const P_CLASS = "text-sm text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed";
const HR_CLASS = "border-t border-gray-200 dark:border-gray-700";

interface JobDescriptionProps {
  content: string;
}

export default function JobDescription({ content }: JobDescriptionProps) {
  if (!content) return null;

  const blocks = content.split(/\n\n+/);
  const elements: React.ReactNode[] = [];
  let keyCounter = 0;

  blocks.forEach((block) => {
    const lines = block.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
    if (lines.length === 0) return;

    // Single line block
    if (lines.length === 1) {
      const line = lines[0].trim();
      if (isHorizontalRule(line)) {
        elements.push(<hr key={keyCounter++} className={HR_CLASS} />);
      } else if (isHeading(line)) {
        elements.push(renderHeading(line, keyCounter++));
      } else if (isBullet(line)) {
        elements.push(
          <ul key={keyCounter++} className={UL_CLASS}>
            <li className={LI_CLASS}>{parseInline(stripBulletMarker(line))}</li>
          </ul>
        );
      } else {
        elements.push(<p key={keyCounter++} className={P_CLASS}>{parseInline(line)}</p>);
      }
      return;
    }

    const firstLine = lines[0].trim();
    const firstIsHeading = isHeading(firstLine);
    const hasBulletMarkers = lines.some(l => isBullet(l));
    const avgLen = lines.reduce((sum, l) => sum + l.trim().length, 0) / lines.length;

    // Pattern: heading followed by list items (implicit or explicit bullets)
    if (firstIsHeading && lines.length >= 3) {
      elements.push(renderHeading(firstLine, keyCounter++));
      const items = lines.slice(1).filter(l => !isHorizontalRule(l.trim())).map((l, j) => {
        const text = isBullet(l) ? stripBulletMarker(l) : l.trim();
        return <li key={j} className={LI_CLASS}>{parseInline(text)}</li>;
      });
      elements.push(<ul key={keyCounter++} className={UL_CLASS}>{items}</ul>);
      return;
    }

    // Pattern: all lines are short and no heading — implicit bullet list
    if (!firstIsHeading && lines.length >= 3 && avgLen < 100 && !hasBulletMarkers) {
      const items = lines.filter(l => !isHorizontalRule(l.trim())).map((l, j) => (
        <li key={j} className={LI_CLASS}>{parseInline(l.trim())}</li>
      ));
      elements.push(<ul key={keyCounter++} className={UL_CLASS}>{items}</ul>);
      return;
    }

    // Default: process line by line, grouping consecutive bullets
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      if (isHorizontalRule(line)) {
        elements.push(<hr key={keyCounter++} className={HR_CLASS} />);
        i++;
        continue;
      }

      if (isHeading(line)) {
        elements.push(renderHeading(line, keyCounter++));
        i++;
        continue;
      }

      if (isBullet(line)) {
        const items: React.ReactNode[] = [];
        while (i < lines.length && isBullet(lines[i].trim())) {
          items.push(<li key={items.length} className={LI_CLASS}>{parseInline(stripBulletMarker(lines[i].trim()))}</li>);
          i++;
        }
        elements.push(<ul key={keyCounter++} className={UL_CLASS}>{items}</ul>);
        continue;
      }

      elements.push(<p key={keyCounter++} className={P_CLASS}>{parseInline(line)}</p>);
      i++;
    }
  });

  // Merge consecutive single-item <ul>s
  const merged: React.ReactNode[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i] as React.ReactElement;
    if (el?.type === 'ul') {
      const items: React.ReactNode[] = [];
      let j = i;
      while (j < elements.length && (elements[j] as React.ReactElement)?.type === 'ul') {
        const curr = elements[j] as React.ReactElement;
        const children = Array.isArray((curr.props as any).children) ? (curr.props as any).children : [(curr.props as any).children];
        items.push(...children);
        j++;
      }
      if (items.length > 1) {
        merged.push(<ul key={`m-${i}`} className={UL_CLASS}>{items}</ul>);
        i = j - 1;
      } else {
        merged.push(el);
      }
    } else {
      merged.push(el);
    }
  }

  return <div className="description-content flex flex-col gap-2 [&>h3]:mt-4 [&>h3:first-child]:mt-0 [&>ul]:my-1">{merged}</div>;
}
