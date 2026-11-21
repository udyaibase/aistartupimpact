"use client";

import { useEditor, EditorContent, Extension } from "@tiptap/react";
import { Plugin } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, List, ListOrdered, Heading2, Link as LinkIcon, Undo, Redo, Minus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { descriptionForEditor, keepLineBreaks, looksLikeMarkdown, markdownToHtml } from "@/lib/markdown-lite";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
}


/**
 * Hard character limit. Typing stops at the limit, and a paste is cut to the space left, so what's on screen is
 * always exactly what gets saved. (Before, text past the limit stayed on screen but was silently not saved.)
 * Deleting is always allowed, even for older text that is already over the limit.
 */
const characterLimit = (limit: number, onBlocked: () => void) =>
  Extension.create({
    name: "characterLimit",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction: (tr, state) => {
            if (!tr.docChanged) return true;
            const next = tr.doc.textContent.length;
            if (next <= limit || next <= state.doc.textContent.length) return true;
            onBlocked();
            return false;
          },
        }),
      ];
    },
  });

/** Tags that mean the clipboard already carries real formatting (a selection copied from a web page or a document). */
const RICH_HTML = /<(h[1-6]|ul|ol|li|strong|b|em|i|a|blockquote|table)\b/i;

/**
 * Pasting. Text copied with ChatGPT's or Claude's copy button arrives as Markdown in plain text: it is turned into
 * headings, lists, bold and links instead of being left as "#", "-" and "**". Plain text with several lines keeps
 * its lines. A paste longer than the room left is cut to fit, and says so. Formatted copies (a selection from a
 * page) go through the editor's normal paste.
 */
const smartPaste = (limit: number | undefined, onCut: () => void) =>
  Extension.create({
    name: "smartPaste",
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          props: {
            handlePaste: (view, event) => {
              const text = event.clipboardData?.getData("text/plain") ?? "";
              if (!text) return false;
              const rich = RICH_HTML.test(event.clipboardData?.getData("text/html") ?? "");
              const { from, to } = view.state.selection;
              const room = limit ? limit - (view.state.doc.textContent.length - view.state.doc.textBetween(from, to).length) : Infinity;
              const fits = text.length <= room;
              if (fits && (rich || (!text.includes("\n") && !looksLikeMarkdown(text)))) return false; // normal paste
              if (!fits) onCut();
              // Cut at the end of a word, not in the middle of one.
              const source = fits ? text : text.slice(0, Math.max(0, room)).replace(/\s+\S*$/, "");
              if (source.trim()) editor.chain().focus().insertContent(markdownToHtml(source)).run();
              return true;
            },
          },
        }),
      ];
    },
  });

export default function RichTextEditor({ content, onChange, placeholder = "Write your event description...", maxLength = 5000 }: RichTextEditorProps) {
  const [atLimit, setAtLimit] = useState(false);
  const blockedRef = useRef(() => setAtLimit(true));
  // A paste that was too long is cut to fit. The note about it stays until the host next edits the text, so it
  // can't be missed (the "limit reached" note above clears as soon as the text is under the limit again).
  const [pasteCut, setPasteCut] = useState(false);
  const justCut = useRef(false);
  const cutRef = useRef(() => { justCut.current = true; setPasteCut(true); });
  const editor = useEditor({
    extensions: [
      ...(maxLength ? [characterLimit(maxLength, () => blockedRef.current())] : []),
      smartPaste(maxLength, () => cutRef.current()),
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-brand underline", rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    // A description saved as plain text (or with raw line breaks) is given its formatting back.
    content: descriptionForEditor(content),
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[150px] px-3.5 py-2.5 focus:outline-none font-jakarta text-sm text-gray-900 dark:text-white",
      },
    },
    onUpdate: ({ editor }) => {
      // Always report what's on screen; the limit itself is enforced above.
      // Line breaks are stored as <br>: as raw newlines they showed here but ran together when read back.
      onChange(keepLineBreaks(editor.getHTML()));
      if (maxLength && editor.state.doc.textContent.length < maxLength) setAtLimit(false);
      if (justCut.current) justCut.current = false; else setPasteCut(false);
    },
  });

  useEffect(() => {
    if (!editor || !content || editor.isFocused) return;
    const wanted = descriptionForEditor(content);
    if (keepLineBreaks(editor.getHTML()) !== wanted) editor.commands.setContent(wanted);
  }, [content, editor]);

  if (!editor) return null;

  const charCount = editor.state.doc.textContent.length;

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-wrap">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading"
        >
          <Heading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => {
            const url = window.prompt("Enter URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive("link")}
          title="Link"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Divider"
        >
          <Minus className="w-3.5 h-3.5" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Character count */}
      {maxLength && (
        <div className="px-3 py-1 border-t border-gray-100 dark:border-gray-800">
          <span aria-live="polite" className={`text-xs font-jakarta ${charCount > maxLength * 0.9 || pasteCut ? "text-red-500" : "text-gray-400"}`}>
            {charCount.toLocaleString("en-IN")}/{maxLength.toLocaleString("en-IN")}
            {charCount > maxLength
              ? ` · ${(charCount - maxLength).toLocaleString("en-IN")} over the limit. Shorten it to save.`
              : pasteCut ? ` · What you pasted was longer than ${maxLength.toLocaleString("en-IN")} characters, so the end was left out. Shorten it and paste the rest.`
              : atLimit ? " · Limit reached. Extra text wasn’t added." : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ onClick, active, disabled, title, children }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-brand/10 text-brand"
          : disabled
          ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
          : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />;
}
