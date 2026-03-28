const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const requireApproved = require('../middleware/requireApproved');

const router = express.Router();

// POST /api/comments/posts/:slug — create a comment
router.post('/posts/:slug',
  authenticate,
  requireApproved,
  body('body').trim().isLength({ min: 1, max: 2000 }).withMessage('Comment must be 1-2000 characters'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const postResult = await pool.query('SELECT id FROM posts WHERE slug = $1', [req.params.slug]);
      if (postResult.rows.length === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }

      const postId = postResult.rows[0].id;
      const result = await pool.query(
        `INSERT INTO comments (body, post_id, author_id)
         VALUES ($1, $2, $3)
         RETURNING id, body, created_at, updated_at`,
        [req.body.body, postId, req.user.userId]
      );

      res.status(201).json({
        ...result.rows[0],
        author: req.user.username,
        author_id: req.user.userId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/comments/:id — edit a comment
router.put('/:id',
  authenticate,
  body('body').trim().isLength({ min: 1, max: 2000 }).withMessage('Comment must be 1-2000 characters'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const comment = await pool.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
      if (comment.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      if (comment.rows[0].author_id !== req.user.userId) {
        return res.status(403).json({ error: 'Only the comment author can edit' });
      }

      const result = await pool.query(
        'UPDATE comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING id, body, created_at, updated_at',
        [req.body.body, req.params.id]
      );

      const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.user.userId]);

      res.json({
        ...result.rows[0],
        author: userResult.rows[0].username,
        author_id: req.user.userId,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/comments/:id — delete a comment
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const comment = await pool.query(
      `SELECT c.*, p.author_id AS post_author_id
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (comment.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const c = comment.rows[0];
    const isCommentAuthor = c.author_id === req.user.userId;
    const isPostAuthor = c.post_author_id === req.user.userId;
    const isAdmin = req.user.role === 'admin';

    if (!isCommentAuthor && !isPostAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
