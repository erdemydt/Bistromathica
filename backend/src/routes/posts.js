const express = require('express');
const { body, query, validationResult } = require('express-validator');
const slugify = require('slugify');
const sanitizeHtml = require('sanitize-html');
const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const requireApproved = require('../middleware/requireApproved');

const router = express.Router();

const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'u', 's', 'del',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'a', 'img', 'hr',
  'span', 'div',
  'sup',
];

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    code: ['class'],
    pre: ['class'],
    span: ['class', 'style'],
    sup: ['data-citation', 'class'],
  },
};

function sanitizeCitations(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100)
    .map((c, i) => ({
      id: parseInt(c.id, 10) || i + 1,
      title: String(c.title || '').trim().substring(0, 200),
      url: String(c.url || '').trim().substring(0, 2000),
    }))
    .filter((citation) => citation.title || citation.url);
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function generateUniqueSlug(title, excludePostId = null) {
  const baseSlug = slugify(title, { lower: true, strict: true });
  if (!baseSlug) return `post-${Date.now()}`;

  let query_text = 'SELECT slug FROM posts WHERE slug = $1';
  const params = [baseSlug];

  if (excludePostId) {
    query_text += ' AND id != $2';
    params.push(excludePostId);
  }

  const existing = await pool.query(query_text, params);
  if (existing.rows.length === 0) return baseSlug;

  // Find highest suffix
  const likeQuery = excludePostId
    ? 'SELECT slug FROM posts WHERE slug LIKE $1 AND id != $2'
    : 'SELECT slug FROM posts WHERE slug LIKE $1';
  const likeParams = excludePostId
    ? [`${baseSlug}%`, excludePostId]
    : [`${baseSlug}%`];

  const similar = await pool.query(likeQuery, likeParams);
  const slugs = similar.rows.map(r => r.slug);

  let suffix = 2;
  while (slugs.includes(`${baseSlug}-${suffix}`)) {
    suffix++;
  }
  return `${baseSlug}-${suffix}`;
}

async function syncTags(postId, tags) {
  await pool.query('DELETE FROM post_tags WHERE post_id = $1', [postId]);

  if (!tags || tags.length === 0) return [];

  const resultTags = [];
  for (const tagName of tags) {
    const tagSlug = slugify(tagName.trim(), { lower: true, strict: true });
    if (!tagSlug) continue;

    // Find or create tag
    let tagResult = await pool.query('SELECT id, name, slug FROM tags WHERE slug = $1', [tagSlug]);
    if (tagResult.rows.length === 0) {
      tagResult = await pool.query(
        'INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id, name, slug',
        [tagName.trim(), tagSlug]
      );
    }

    const tag = tagResult.rows[0];
    await pool.query(
      'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [postId, tag.id]
    );
    resultTags.push({ id: tag.id, name: tag.name, slug: tag.slug });
  }

  return resultTags;
}

// GET /api/posts — public listing of published posts
router.get('/',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const { tag, author } = req.query;
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

      if (q.length > 120) {
        return res.status(400).json({ error: 'Search query too long' });
      }

      let whereClause = "WHERE p.status = 'published'";
      const params = [];
      let paramIndex = 1;

      if (tag) {
        whereClause += ` AND EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON pt.tag_id = t.id WHERE pt.post_id = p.id AND t.slug = $${paramIndex})`;
        params.push(tag);
        paramIndex++;
      }

      if (author) {
        whereClause += ` AND u.username = $${paramIndex}`;
        params.push(author);
        paramIndex++;
      }

      if (q) {
        whereClause += ` AND (p.title ILIKE $${paramIndex} OR COALESCE(p.excerpt, '') ILIKE $${paramIndex + 1} OR p.body ILIKE $${paramIndex + 2})`;
        const likeQuery = `%${q}%`;
        params.push(likeQuery, likeQuery, likeQuery);
        paramIndex += 3;
      }

      const countQuery = `
        SELECT COUNT(*) FROM posts p
        JOIN users u ON p.author_id = u.id
        ${whereClause}
      `;
      const countResult = await pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      const postsQuery = `
        SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image, p.published_at, p.created_at,
               u.username AS author,
               (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
        FROM posts p
        JOIN users u ON p.author_id = u.id
        ${whereClause}
        ORDER BY p.published_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      const postsResult = await pool.query(postsQuery, [...params, limit, offset]);

      // Fetch tags for each post
      const posts = [];
      for (const post of postsResult.rows) {
        const tagsResult = await pool.query(
          'SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = $1',
          [post.id]
        );
        posts.push({
          ...post,
          comment_count: parseInt(post.comment_count),
          tags: tagsResult.rows,
        });
      }

      res.json({
        posts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/posts/drafts — current user's drafts (MUST be before /:slug)
router.get('/drafts', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.cover_image, p.created_at, p.updated_at
       FROM posts p
       WHERE p.author_id = $1 AND p.status = 'draft'
       ORDER BY p.updated_at DESC`,
      [req.user.userId]
    );

    const posts = [];
    for (const post of result.rows) {
      const tagsResult = await pool.query(
        'SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = $1',
        [post.id]
      );
      posts.push({ ...post, tags: tagsResult.rows });
    }

    res.json({ posts });
  } catch (err) {
    next(err);
  }
});

// GET /api/posts/:slug — single post
router.get('/:slug', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.username AS author, u.id AS author_id_ref
       FROM posts p
       JOIN users u ON p.author_id = u.id
       WHERE p.slug = $1`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = result.rows[0];

    // Draft access control
    if (post.status === 'draft') {
      // Check if user is authenticated
      const jwt = require('jsonwebtoken');
      const token = req.cookies.token;
      let currentUser = null;
      if (token) {
        try {
          currentUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch {}
      }

      if (!currentUser || (currentUser.userId !== post.author_id && currentUser.role !== 'admin')) {
        return res.status(404).json({ error: 'Post not found' });
      }
    }

    // Fetch tags
    const tagsResult = await pool.query(
      'SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = $1',
      [post.id]
    );

    // Fetch comments
    const commentsResult = await pool.query(
      `SELECT c.id, c.body, c.created_at, c.updated_at,
              u.username AS author, u.id AS author_id
       FROM comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [post.id]
    );

    res.json({
      id: post.id,
      title: post.title,
      slug: post.slug,
      body: post.body,
      excerpt: post.excerpt,
      cover_image: post.cover_image,
      status: post.status,
      author: post.author,
      author_id: post.author_id,
      created_at: post.created_at,
      updated_at: post.updated_at,
      published_at: post.published_at,
      tags: tagsResult.rows,
      comments: commentsResult.rows,
      citations: post.citations || [],
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/posts — create a post
router.post('/',
  authenticate,
  requireApproved,
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required (max 200 chars)'),
  body('body').notEmpty().withMessage('Body is required'),
  body('excerpt').optional().isLength({ max: 300 }),
  body('status').optional().isIn(['draft', 'published']),
  body('tags').optional().isArray(),
  body('citations').optional().isArray(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, body: rawBody, excerpt, cover_image, status = 'draft', tags, citations } = req.body;
      const sanitizedCitations = sanitizeCitations(citations);

      const sanitizedBody = sanitizeHtml(rawBody, SANITIZE_OPTIONS);
      const slug = await generateUniqueSlug(title);
      const autoExcerpt = excerpt || stripHtml(sanitizedBody).substring(0, 300);
      const publishedAt = status === 'published' ? new Date() : null;

      const result = await pool.query(
        `INSERT INTO posts (title, slug, body, excerpt, cover_image, status, author_id, published_at, citations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [title, slug, sanitizedBody, autoExcerpt, cover_image || null, status, req.user.userId, publishedAt, JSON.stringify(sanitizedCitations)]
      );

      const post = result.rows[0];
      const postTags = await syncTags(post.id, tags);

      // Get author username
      const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.user.userId]);

      res.status(201).json({
        ...post,
        author: userResult.rows[0].username,
        tags: postTags,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/posts/:slug — edit a post
router.put('/:slug',
  authenticate,
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('body').optional().notEmpty(),
  body('excerpt').optional().isLength({ max: 300 }),
  body('status').optional().isIn(['draft', 'published']),
  body('tags').optional().isArray(),
  body('citations').optional().isArray(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Get current post
      const current = await pool.query(
        'SELECT * FROM posts WHERE slug = $1',
        [req.params.slug]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const post = current.rows[0];

      // Check ownership
      if (post.author_id !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to edit this post' });
      }

      const { title, body: rawBody, excerpt, cover_image, status, tags, citations } = req.body;
      const newCitations = citations !== undefined
        ? sanitizeCitations(citations)
        : (post.citations || []);

      const newTitle = title || post.title;
      const newBody = rawBody ? sanitizeHtml(rawBody, SANITIZE_OPTIONS) : post.body;
      const newExcerpt = excerpt !== undefined ? excerpt : post.excerpt;
      const newCoverImage = cover_image !== undefined ? cover_image : post.cover_image;
      const newStatus = status || post.status;

      // Regenerate slug if title changed
      let newSlug = post.slug;
      if (title && title !== post.title) {
        newSlug = await generateUniqueSlug(title, post.id);
      }

      // Set published_at if publishing for the first time
      let publishedAt = post.published_at;
      if (newStatus === 'published' && !post.published_at) {
        publishedAt = new Date();
      }

      const result = await pool.query(
        `UPDATE posts SET title = $1, slug = $2, body = $3, excerpt = $4, cover_image = $5,
         status = $6, published_at = $7, citations = $8, updated_at = NOW()
         WHERE id = $9 RETURNING *`,
        [newTitle, newSlug, newBody, newExcerpt, newCoverImage, newStatus, publishedAt, JSON.stringify(newCitations), post.id]
      );

      const updatedPost = result.rows[0];
      const postTags = tags !== undefined ? await syncTags(post.id, tags) : [];

      if (tags === undefined) {
        const tagsResult = await pool.query(
          'SELECT t.id, t.name, t.slug FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = $1',
          [post.id]
        );
        updatedPost.tags = tagsResult.rows;
      } else {
        updatedPost.tags = postTags;
      }

      const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [updatedPost.author_id]);
      updatedPost.author = userResult.rows[0].username;

      res.json(updatedPost);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/posts/:slug
router.delete('/:slug', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM posts WHERE slug = $1', [req.params.slug]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = result.rows[0];
    if (post.author_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await pool.query('DELETE FROM posts WHERE id = $1', [post.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
