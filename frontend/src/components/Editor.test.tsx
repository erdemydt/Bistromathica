import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PostEditor from './Editor';

const fakeEditor = {
  on: vi.fn(),
  off: vi.fn(),
  getHTML: vi.fn(() => '<p>Body</p>'),
  isActive: vi.fn(() => false),
  chain: vi.fn(() => ({
    focus: () => ({
      toggleBold: () => ({ run: () => true }),
      toggleItalic: () => ({ run: () => true }),
      toggleUnderline: () => ({ run: () => true }),
      toggleStrike: () => ({ run: () => true }),
      toggleHeading: () => ({ run: () => true }),
      toggleBulletList: () => ({ run: () => true }),
      toggleOrderedList: () => ({ run: () => true }),
      toggleBlockquote: () => ({ run: () => true }),
      toggleCodeBlock: () => ({ run: () => true }),
      setHorizontalRule: () => ({ run: () => true }),
      insertContent: () => ({ run: () => true }),
    }),
  })),
};

vi.mock('@tiptap/react', () => ({
  useEditor: () => fakeEditor,
  EditorContent: ({ className }: { className?: string }) => (
    <div data-testid="editor-content" className={className} />
  ),
}));

describe('PostEditor submit path', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fakeEditor.isActive.mockReturnValue(false);

    Object.defineProperty(window, 'location', {
      value: {
        href: '',
        assign: vi.fn(),
      },
      writable: true,
    });
  });

  it('uses POST for new posts', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'draft', slug: 'new-post' }),
    });

    render(<PostEditor />);

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'New post title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses PUT for existing posts', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'draft', slug: 'updated-post' }),
    });

    render(
      <PostEditor
        initialData={{
          title: 'Original',
          body: '<p>Body</p>',
          excerpt: '',
          cover_image: '',
          status: 'draft',
          tags: [],
          slug: 'original-slug',
          citations: [],
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Edited title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update & Publish' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/posts/original-slug',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});

