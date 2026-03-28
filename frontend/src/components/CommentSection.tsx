import { useState } from 'react';

const API_URL = '/api';

interface Comment {
  id: string;
  body: string;
  author: string;
  author_id: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  username: string;
  role: string;
  approved: boolean;
}

interface Props {
  postSlug: string;
  initialComments: Comment[];
  currentUser: User | null;
  postAuthorId: string;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CommentSection({
  postSlug,
  initialComments,
  currentUser,
  postAuthorId,
}: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/comments/posts/${postSlug}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.errors?.[0]?.msg || 'Failed to post comment');
        return;
      }
      setComments([...comments, data]);
      setNewComment('');
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(id: string) {
    if (!editBody.trim()) return;
    try {
      const res = await fetch(`${API_URL}/comments/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to edit comment');
        return;
      }
      setComments(comments.map((c) => (c.id === id ? data : c)));
      setEditingId(null);
      setEditBody('');
    } catch {
      setError('Network error');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this comment?')) return;
    try {
      const res = await fetch(`${API_URL}/comments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setComments(comments.filter((c) => c.id !== id));
      }
    } catch {
      setError('Network error');
    }
  }

  function canDelete(comment: Comment) {
    if (!currentUser) return false;
    return (
      currentUser.id === comment.author_id ||
      currentUser.id === postAuthorId ||
      currentUser.role === 'admin'
    );
  }

  function canEdit(comment: Comment) {
    if (!currentUser) return false;
    return currentUser.id === comment.author_id;
  }

  return (
    <div className="comment-section">
      {comments.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)', fontSize: '0.875rem' }}>
          No comments yet. Be the first!
        </p>
      )}

      <div className="comment-list">
        {comments.map((comment) => (
          <div key={comment.id} className="comment">
            <div className="comment-header">
              <strong>{comment.author}</strong>
              <span className="comment-date">{formatDate(comment.created_at)}</span>
              {comment.updated_at !== comment.created_at && (
                <span className="comment-edited">(edited)</span>
              )}
            </div>

            {editingId === comment.id ? (
              <div className="comment-edit">
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  maxLength={2000}
                  rows={3}
                />
                <div className="comment-edit-actions">
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    {editBody.length}/2000
                  </span>
                  <button className="btn" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleEdit(comment.id)}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="comment-body">{comment.body}</p>
                <div className="comment-actions">
                  {canEdit(comment) && (
                    <button
                      className="comment-action-btn"
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditBody(comment.body);
                      }}
                    >
                      Edit
                    </button>
                  )}
                  {canDelete(comment) && (
                    <button
                      className="comment-action-btn danger"
                      onClick={() => handleDelete(comment.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {currentUser && currentUser.approved ? (
        <form onSubmit={handleSubmit} className="comment-form">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            maxLength={2000}
            rows={3}
            required
          />
          <div className="comment-form-footer">
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {newComment.length}/2000
            </span>
            {error && <span className="error-text">{error}</span>}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </form>
      ) : currentUser ? (
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)', fontSize: '0.875rem', marginTop: '1rem' }}>
          Your account is pending approval.
        </p>
      ) : (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '0.875rem', marginTop: '1rem' }}>
          <a href="/login">Log in</a> to comment.
        </p>
      )}
    </div>
  );
}
