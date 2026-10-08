"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { getMessages } from "@/messages";
import { cn } from "./ui";

/**
 * Rich text field for descriptions, replies and notes. The HTML goes into a hidden input
 * named `name`, so it submits with an ordinary form; the server sanitizes it before saving.
 */
export function RichTextEditor({
  id,
  name,
  initialHtml = "",
  placeholder,
  labelledBy,
}: {
  id: string;
  name: string;
  initialHtml?: string;
  placeholder?: string;
  labelledBy?: string;
}) {
  const t = getMessages().tickets.editor;
  const [html, setHtml] = useState(initialHtml);
  const editor = useEditor({
    // Rendered on the server first; let Tiptap mount on the client only.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        ...(placeholder
          ? { "aria-placeholder": placeholder, "data-placeholder": placeholder }
          : {}),
        class:
          "prose-petey min-h-32 px-3 py-2 text-sm focus:outline-none [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:rounded [&_pre]:bg-zinc-100 [&_pre]:p-2 dark:[&_pre]:bg-zinc-800 [&_ul]:list-disc [&_ul]:pl-5",
      },
    },
    onUpdate: ({ editor: e }) => setHtml(e.isEmpty ? "" : e.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      link: e?.isActive("link") ?? false,
      codeBlock: e?.isActive("codeBlock") ?? false,
      blockquote: e?.isActive("blockquote") ?? false,
    }),
  });

  const buttons: {
    key: keyof NonNullable<typeof active>;
    label: string;
    glyph: string;
    run: () => void;
  }[] = [
    {
      key: "bold",
      label: t.bold,
      glyph: "B",
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      key: "italic",
      label: t.italic,
      glyph: "I",
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      key: "bulletList",
      label: t.bulletList,
      glyph: "•",
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      label: t.orderedList,
      glyph: "1.",
      run: () => editor?.chain().focus().toggleOrderedList().run(),
    },
    {
      key: "blockquote",
      label: t.quote,
      glyph: "❝",
      run: () => editor?.chain().focus().toggleBlockquote().run(),
    },
    {
      key: "codeBlock",
      label: t.code,
      glyph: "</>",
      run: () => editor?.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: "link",
      label: t.link,
      glyph: "🔗",
      run: () => {
        if (!editor) return;
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        const href = window.prompt(t.linkPrompt, "https://");
        if (href && /^(https?:|mailto:)/i.test(href))
          editor.chain().focus().setLink({ href }).run();
      },
    },
  ];

  return (
    <div className="rounded-md border border-zinc-300 bg-white shadow-sm focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-500/30 dark:border-zinc-700 dark:bg-zinc-900">
      <div
        role="toolbar"
        aria-label={t.toolbar}
        className="flex flex-wrap gap-1 border-b border-zinc-200 p-1 dark:border-zinc-800"
      >
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            title={b.label}
            aria-label={b.label}
            aria-pressed={active?.[b.key] ?? false}
            onClick={b.run}
            className={cn(
              "min-w-8 rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800",
              active?.[b.key] && "bg-zinc-200 dark:bg-zinc-700",
            )}
          >
            {b.glyph}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
