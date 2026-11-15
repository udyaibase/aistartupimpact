'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Italic, LayoutList, List, ListOrdered, Redo2, Undo2 } from 'lucide-react';
import { descriptionFromDoc, descriptionToHtml } from '@/lib/jobs/description-format';

/**
 * Job description editor: what you see is what candidates get. Bold looks bold, lists are real lists, no symbols.
 * It still saves the simple markup the job page and other tools read (see lib/jobs/description-format), so jobs
 * written before this editor load and display exactly as before.
 */

const SECTIONS_HTML =
  '<h2>About the role</h2><p></p><h2>What you’ll do</h2><ul><li><p></p></li></ul><h2>What we’re looking for</h2><ul><li><p></p></li></ul><h2>Nice to have</h2><ul><li><p></p></li></ul>';

export default function DescriptionEditor({ id, value, onChange, invalid, describedBy }: {
  id: string;
  value: string;
  onChange: (markup: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  // The markup this editor last produced, so outside changes (a template, a pasted JD, a duplicate) can be told apart.
  const lastEmitted = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        blockquote: false,
        strike: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
    ],
    content: descriptionToHtml(value),
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Job description',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        class: [
          'min-h-[260px] max-h-[560px] overflow-y-auto px-3.5 py-3 focus:outline-none text-sm leading-relaxed text-gray-800 dark:text-gray-200',
          '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-white [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2:first-child]:mt-0',
          '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-900 dark:[&_h3]:text-white [&_h3]:mt-3 [&_h3]:mb-1',
          '[&_p]:my-1.5 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_li_p]:my-0',
          '[&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-white',
        ].join(' '),
      },
    },
    onUpdate: ({ editor: ed }) => {
      const markup = descriptionFromDoc(ed.getJSON() as Parameters<typeof descriptionFromDoc>[0]);
      lastEmitted.current = markup;
      onChange(markup);
    },
  });

  // Content replaced from outside (template, AI parse, duplicate): load it into the editor.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(descriptionToHtml(value), { emitUpdate: false });
  }, [value, editor]);

  // Keep error/description wiring current on the editable element.
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          ...(editor.options.editorProps?.attributes as Record<string, string>),
          ...(describedBy ? { 'aria-describedby': describedBy } : {}),
          'aria-invalid': invalid ? 'true' : 'false',
        },
      },
    });
  }, [editor, invalid, describedBy]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      heading: !!ed?.isActive('heading'),
      bullet: !!ed?.isActive('bulletList'),
      ordered: !!ed?.isActive('orderedList'),
      canUndo: !!ed?.can().undo(),
      canRedo: !!ed?.can().redo(),
      empty: !ed || ed.isEmpty,
    }),
  });

  const btn = (active: boolean) =>
    `inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-35 disabled:pointer-events-none ${
      active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  const tools = [
    { label: 'Bold', key: 'Ctrl+B', active: state?.bold, run: () => editor?.chain().focus().toggleBold().run(), icon: <Bold className="w-4 h-4" aria-hidden /> },
    { label: 'Italic', key: 'Ctrl+I', active: state?.italic, run: () => editor?.chain().focus().toggleItalic().run(), icon: <Italic className="w-4 h-4" aria-hidden /> },
    null,
    { label: 'Heading', active: state?.heading, run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), icon: <Heading2 className="w-4 h-4" aria-hidden /> },
    { label: 'Bulleted list', active: state?.bullet, run: () => editor?.chain().focus().toggleBulletList().run(), icon: <List className="w-4 h-4" aria-hidden /> },
    { label: 'Numbered list', active: state?.ordered, run: () => editor?.chain().focus().toggleOrderedList().run(), icon: <ListOrdered className="w-4 h-4" aria-hidden /> },
    null,
    { label: 'Undo', key: 'Ctrl+Z', active: false, disabled: !state?.canUndo, run: () => editor?.chain().focus().undo().run(), icon: <Undo2 className="w-4 h-4" aria-hidden /> },
    { label: 'Redo', key: 'Ctrl+Shift+Z', active: false, disabled: !state?.canRedo, run: () => editor?.chain().focus().redo().run(), icon: <Redo2 className="w-4 h-4" aria-hidden /> },
  ];

  return (
    <div className={`rounded-[10px] border bg-white dark:bg-gray-900 transition-shadow focus-within:ring-2 focus-within:ring-brand/25 ${
      invalid ? 'border-red-600' : 'border-gray-300 dark:border-gray-700 focus-within:border-brand'
    }`}>
      <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-gray-200 dark:border-gray-800">
        {tools.map((t, i) => t === null
          ? <span key={`d${i}`} className="w-px h-5 mx-1 bg-gray-200 dark:bg-gray-700" aria-hidden />
          : (
            <button key={t.label} type="button" className={btn(!!t.active)} aria-label={t.label} aria-pressed={t.disabled === undefined ? !!t.active : undefined}
              title={t.key ? `${t.label} (${t.key})` : t.label} disabled={!editor || t.disabled}
              onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
              {t.icon}
            </button>
          ))}
        {state?.empty && (
          <button type="button" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { editor?.chain().focus().setContent(SECTIONS_HTML).setTextSelection(15).run(); }}
            className="ml-auto inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[13px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
            <LayoutList className="w-4 h-4" aria-hidden /> Add standard sections
          </button>
        )}
      </div>
      {editor ? <EditorContent editor={editor} /> : <div className="min-h-[260px]" aria-hidden />}
    </div>
  );
}
