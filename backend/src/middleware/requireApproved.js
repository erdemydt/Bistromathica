const pool = require('../db');

async function requireApproved(req, res, next) {
  try {
    const result = await pool.query('SELECT approved FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0 || !result.rows[0].approved) {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireApproved;
