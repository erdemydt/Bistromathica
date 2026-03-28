# My Blog Site

A modern, full-stack blogging platform with user authentication, admin dashboard, and rich text editing. Check out `https://bistromathica.com/`

## Features

- **User Authentication** – Register, login, and password reset with JWT tokens
- **Admin Dashboard** – Manage users (approve/reject), posts, and comments
- **Rich Text Editor** – Write posts with TipTap editor (formatting, code blocks, links)
- **Draft Support** – Save and edit drafts before publishing
- **Email Notifications** – Nodemailer integration for password resets
- **Rate Limiting** – API protection with express-rate-limit

## Tech Stack

**Frontend:** Astro + React, TipTap editor
**Backend:** Node.js/Express + PostgreSQL
**Auth:** JWT + bcrypt

## Quick Start

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` (frontend).

## Project Structure

```
frontend/
  ├── src/pages/      # Page routes (write, drafts, admin, etc.)
  ├── src/components/ # Reusable components
  └── src/lib/        # API helpers & utilities

backend/
  ├── src/routes/     # API endpoints (auth, posts, admin)
  ├── src/models/     # Database queries
  └── src/middleware/ # Auth & validation
```
