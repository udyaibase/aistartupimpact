'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** A paragraph cut to a few lines, with "Read more" only when it is actually cut. */
export default function ExpandableText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + 2);
  }, [text, open]);
  return (
    <>
      <p ref={ref} className={`${className ?? ''} ${open ? '' : 'line-clamp-4'}`} style={style}>{text}</p>
      {(cut || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="mt-1 -ml-1 px-1 min-h-[44px] inline-flex items-center text-sm font-semibold hover:underline [-webkit-tap-highlight-color:transparent]" style={{ color: 'var(--embed-accent-text)' }}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  );
}
