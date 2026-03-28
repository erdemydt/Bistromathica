import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

const API_URL = "http://localhost:3001/api";

interface EditorProps {
  initialData?: {
    title: string;
    body: string;
    excerpt: string;
    cover_image: string;
    status: string;
    tags: { name: string }[];
    slug: string;
  };
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`toolbar-btn ${active ? "active" : ""}`}
      title={title}
    >
      {children}
    </button>
  );
}

export default function PostEditor({ initialData }: EditorProps) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(initialData?.cover_image || "");
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags?.map((t) => t.name).join(", ") || "",
  );
  const [status, setStatus] = useState(initialData?.status || "draft");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
    ],
    content: initialData?.body || "",
    immediatelyRender: false,
  });

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  async function handleSubmit(submitStatus: string) {
    if (!editor) return;
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setError("");
    setSaving(true);

    const body = editor.getHTML();
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      title,
      body,
      excerpt: excerpt || undefined,
      cover_image: coverImage || undefined,
      status: submitStatus,
      tags,
    };

    try {
      const isEdit = !!initialData?.slug;
      const url = isEdit
        ? `${API_URL}/posts/${initialData.slug}`
        : `${API_URL}/posts`;
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.errors?.[0]?.msg || "Failed to save post");
        return;
      }

      window.location.href =
        data.status === "published" ? `/posts/${data.slug}` : "/drafts";
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!editor) return null;

  return (
    <div className="editor-container">
      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          maxLength={200}
        />
      </div>

      <div className="toolbar">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Underline"
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <s>S</s>
        </ToolbarButton>

        <span className="toolbar-divider" />

        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarButton>

        <span className="toolbar-divider" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet List"
        >
          &bull; List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered List"
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Blockquote"
        >
          &ldquo; Quote
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code Block"
        >
          {"</>"}
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          &mdash;
        </ToolbarButton>
        <ToolbarButton
          onClick={setLink}
          active={editor.isActive("link")}
          title="Link"
        >
          Link
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} className="editor-content" />

      <div className="editor-fields">
        <div className="form-group">
          <label htmlFor="excerpt">
            Excerpt (optional, auto-generated if blank)
          </label>
          <textarea
            id="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Brief summary of the post..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="cover-image">Cover Image URL (optional)</label>
          <input
            id="cover-image"
            type="url"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="tags">Tags (comma-separated)</label>
          <input
            id="tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="javascript, personal, tutorial"
          />
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="editor-actions">
        <button
          type="button"
          className="btn"
          onClick={() => handleSubmit("draft")}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save as Draft"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleSubmit("published")}
          disabled={saving}
        >
          {saving ? "Publishing..." : "Publish"}
        </button>
      </div>
    </div>
  );
}
