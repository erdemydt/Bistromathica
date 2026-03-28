const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// GET /api/admin/pending-users
router.get('/pending-users', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, created_at
       FROM users WHERE approved = false
       ORDER BY created_at ASC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/approve
router.put('/users/:id/approve', async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE users SET approved = true WHERE id = $1 RETURNING id, username, email, role, approved',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/users/:id — reject/delete user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users — all approved users
router.get('/users', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, u.created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
       FROM users u
       WHERE u.approved = true
       ORDER BY u.created_at DESC`
    );
    const users = result.rows.map(u => ({ ...u, post_count: parseInt(u.post_count) }));
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role',
  body('role').isIn(['user', 'admin']).withMessage('Role must be user or admin'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const result = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role',
        [req.body.role, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/admin/posts — all posts
router.get('/posts', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.slug, p.status, p.created_at, p.published_at,
              u.username AS author,
              (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
       FROM posts p
       JOIN users u ON p.author_id = u.id
       ORDER BY p.created_at DESC`
    );
    const posts = result.rows.map(p => ({ ...p, comment_count: parseInt(p.comment_count) }));
    res.json({ posts });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/posts/:id
router.delete('/posts/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/posts/:id/status
router.put('/posts/:id/status',
  body('status').isIn(['draft', 'published']).withMessage('Status must be draft or published'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const current = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const post = current.rows[0];
      let publishedAt = post.published_at;
      if (req.body.status === 'published' && !post.published_at) {
        publishedAt = new Date();
      }

      const result = await pool.query(
        'UPDATE posts SET status = $1, published_at = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
        [req.body.status, publishedAt, req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/admin/comments — all comments
router.get('/comments', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.body, c.created_at,
              u.username AS author,
              p.title AS post_title, p.slug AS post_slug
       FROM comments c
       JOIN users u ON c.author_id = u.id
       JOIN posts p ON c.post_id = p.id
       ORDER BY c.created_at DESC`
    );
    res.json({ comments: result.rows });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/comments/:id
router.delete('/comments/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM comments WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
