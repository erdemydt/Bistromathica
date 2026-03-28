const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const pool = require('../db');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// POST /api/auth/register
router.post('/register',
  authLimiter,
  body('username').trim().isLength({ min: 3, max: 50 }).isAlphanumeric()
    .withMessage('Username must be 3-50 alphanumeric characters'),
  body('email').isEmail().normalizeEmail()
    .withMessage('Valid email is required'),
  body('password').isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password } = req.body;

      const existing = await pool.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email or username already taken' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      // First user or ADMIN_EMAIL becomes admin
      const userCount = await pool.query('SELECT COUNT(*) FROM users');
      const isFirstUser = parseInt(userCount.rows[0].count) === 0;
      const isAdminEmail = process.env.ADMIN_EMAIL && email === process.env.ADMIN_EMAIL;
      const role = (isFirstUser || isAdminEmail) ? 'admin' : 'user';
      const approved = (isFirstUser || isAdminEmail) ? true : false;

      await pool.query(
        'INSERT INTO users (username, email, password_hash, role, approved) VALUES ($1, $2, $3, $4, $5)',
        [username, email, passwordHash, role, approved]
      );

      const message = approved
        ? 'Registration successful. You can now log in.'
        : 'Your account is pending approval by the admin.';

      res.status(201).json({ message });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post('/login',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      const result = await pool.query(
        'SELECT id, username, email, password_hash, role, approved FROM users WHERE email = $1',
        [email]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];

      if (!user.approved) {
        return res.status(403).json({ error: 'Account pending approval' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.cookie('token', token, COOKIE_OPTIONS);
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, approved FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Logged out' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password',
  authLimiter,
  body('email').isEmail().normalizeEmail(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Always return 200 to prevent email enumeration
      const { email } = req.body;
      const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

      if (result.rows.length > 0) {
        const userId = result.rows[0].id;
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(
          'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
          [userId, token, expiresAt]
        );

        // Send email if SMTP is configured
        if (process.env.SMTP_HOST) {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });

          await transporter.sendMail({
            to: email,
            subject: 'Password Reset',
            html: `<p>Click <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}">here</a> to reset your password. This link expires in 1 hour.</p>`,
          });
        } else {
          console.log(`Password reset token for ${email}: ${token}`);
        }
      }

      res.json({ message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/reset-password
router.post('/reset-password',
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password } = req.body;

      const result = await pool.query(
        'SELECT id, user_id FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()',
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const { id: tokenId, user_id: userId } = result.rows[0];
      const passwordHash = await bcrypt.hash(password, 12);

      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
      await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [tokenId]);

      res.json({ message: 'Password has been reset. You can now log in.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
