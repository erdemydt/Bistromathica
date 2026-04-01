import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { CitationMark } from "../tiptap/CitationMark";

const lowlight = createLowlight(common);

const API_URL = "/api";

interface Citation {
  id: number;
  title: string;
  url: string;
}

interface EditorProps {
  initialData?: {
    title: string;
    body: string;
    excerpt: string;
    cover_image: string;
    status: string;
    tags: { name: string }[];
    slug: string;
    citations?: Citation[];
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
  const isEditMode = Boolean(initialData?.slug);
  const [title, setTitle] = useState(initialData?.title || "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(initialData?.cover_image || "");
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags?.map((t) => t.name).join(", ") || "",
  );
  const [citations, setCitations] = useState<Citation[]>(
    initialData?.citations || [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [bodyVersion, setBodyVersion] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        title: initialData?.title || "",
        body: initialData?.body || "",
        excerpt: initialData?.excerpt || "",
        cover_image: initialData?.cover_image || "",
        tags: initialData?.tags?.map((t) => t.name).join(", ") || "",
        citations: initialData?.citations || [],
      }),
    [initialData],
  );
  const initialSnapshotRef = useRef(initialSnapshot);
  const allowNextNavigationRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      CitationMark,
    ],
    content: initialData?.body || "",
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;

    const onUpdate = () => {
      setBodyVersion((prev) => prev + 1);
    };

    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor]);

  useEffect(() => {
    const currentSnapshot = JSON.stringify({
      title,
      body: editor?.getHTML() || initialData?.body || "",
      excerpt,
      cover_image: coverImage,
      tags: tagsInput,
      citations,
    });
    setHasUnsavedChanges(currentSnapshot !== initialSnapshotRef.current);
  }, [title, excerpt, coverImage, tagsInput, citations, editor, initialData, bodyVersion]);

  useEffect(() => {
    if (!hasUnsavedChanges || saving) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges, saving]);

  useEffect(() => {
    if (!hasUnsavedChanges || saving) return;

    const onDocumentClick = (event: MouseEvent) => {
      if (allowNextNavigationRef.current) {
        allowNextNavigationRef.current = false;
        return;
      }

      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const isInternal = destination.origin === current.origin;
      const isSamePage = destination.pathname === current.pathname && destination.search === current.search && destination.hash === current.hash;
      if (!isInternal || isSamePage) return;

      event.preventDefault();
      setPendingNavigation(destination.pathname + destination.search + destination.hash);
    };

    document.addEventListener('click', onDocumentClick, true);
    return () => document.removeEventListener('click', onDocumentClick, true);
  }, [hasUnsavedChanges, saving]);

  function leavePage() {
    if (!pendingNavigation) return;
    allowNextNavigationRef.current = true;
    window.location.assign(pendingNavigation);
  }

  function insertCitation() {
    if (!editor) return;
    const nextId = citations.reduce(
      (max, citation) => Math.max(max, citation.id),
      0,
    ) + 1;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: `[${nextId}]`,
        marks: [{ type: "citation", attrs: { id: nextId } }],
      })
      .run();
    setCitations((prev) => [...prev, { id: nextId, title: "", url: "" }]);
  }

  function removeCitation(id: number) {
    if (!editor) return;

    const doc = new DOMParser().parseFromString(editor.getHTML(), "text/html");
    doc.querySelectorAll(`sup[data-citation="${id}"]`).forEach((node) => node.remove());
    const nextBody = doc.body.innerHTML.trim() || "<p></p>";
    editor.commands.setContent(nextBody);

    setCitations((prev) => prev.filter((citation) => citation.id !== id));
  }

  function updateCitationTitle(id: number, title: string) {
    setCitations((prev) =>
      prev.map((citation) =>
        citation.id === id ? { ...citation, title } : citation,
      ),
    );
  }

  function updateCitationUrl(id: number, url: string) {
    setCitations((prev) =>
      prev.map((citation) =>
        citation.id === id ? { ...citation, url } : citation,
      ),
    );
  }

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
    const filteredCitations = citations.filter(
      (citation) => citation.title.trim() || citation.url.trim(),
    );

    const payload = {
      title,
      body,
      excerpt: excerpt || undefined,
      cover_image: coverImage || undefined,
      status: submitStatus,
      tags,
      citations: filteredCitations,
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

      initialSnapshotRef.current = JSON.stringify({
        title,
        body,
        excerpt,
        cover_image: coverImage,
        tags: tagsInput,
        citations: filteredCitations,
      });
      setHasUnsavedChanges(false);

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
      {isEditMode && (
        <div className="edit-mode-banner meta">
          Editing post: <strong>{initialData?.title || initialData?.slug}</strong>
          {hasUnsavedChanges ? " (unsaved changes)" : ""}
        </div>
      )}

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

        <span className="toolbar-divider" />

        <ToolbarButton onClick={insertCitation} title="Insert citation">
          Cite
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} className="editor-content" />

      {citations.length > 0 && (
        <div className="citation-tray">
          <p className="citation-tray-title">Citations</p>
          {citations.map((c) => (
            <div key={c.id} className="citation-row">
              <span className="citation-index">[{c.id}]</span>
              <input
                type="text"
                placeholder="Title"
                value={c.title}
                onChange={(e) => updateCitationTitle(c.id, e.target.value)}
              />
              <input
                type="url"
                placeholder="URL (https://...)"
                value={c.url}
                onChange={(e) => updateCitationUrl(c.id, e.target.value)}
              />
              <button
                type="button"
                className="btn btn-danger citation-delete-btn"
                onClick={() => removeCitation(c.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

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
          {saving ? "Saving..." : isEditMode ? "Update Draft" : "Save as Draft"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleSubmit("published")}
          disabled={saving}
        >
          {saving ? "Publishing..." : isEditMode ? "Update & Publish" : "Publish"}
        </button>
      </div>

      {pendingNavigation && (
        <div className="leave-modal-backdrop" role="presentation">
          <div className="leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title">
            <h2 id="leave-modal-title">You have unsaved changes.</h2>
            <p className="meta">Leaving now will discard your in-progress edits.</p>
            <div className="leave-modal-actions">
              <button type="button" className="btn" onClick={() => setPendingNavigation(null)}>
                Stay here
              </button>
              <button type="button" className="btn btn-danger" onClick={leavePage}>
                Leave page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
