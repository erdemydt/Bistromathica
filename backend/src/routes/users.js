const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/users/:username — public profile data for approved users
router.get('/:username', async (req, res, next) => {
  try {
    const username = req.params.username?.trim();
    if (!username) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.status = 'published') AS post_count
       FROM users u
       WHERE LOWER(u.username) = LOWER($1)
         AND u.approved = true
       LIMIT 1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      ...user,
      post_count: parseInt(user.post_count),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
