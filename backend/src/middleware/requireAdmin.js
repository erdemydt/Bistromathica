const pool = require('../db');

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.userId]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAdmin;
