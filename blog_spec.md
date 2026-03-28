# Blog Site — Technical Specification
## Must-Have Features — Full Developer Brief

---

## Overview

A multi-user blog platform where the owner (admin) controls who can write. Readers can browse and comment freely once logged in. The platform supports mixed content — personal and technical — so the editor must handle rich text and code blocks well. Built with Astro (frontend) + Node.js/Express (backend API) + PostgreSQL (database).

---

## 1. Authentication System

### What It Is
A complete auth flow covering registration, login, session management, and logout. JWT (JSON Web Tokens) are used for sessions — no server-side session storage.

### Registration
- User fills out: `username`, `email`, `password`
- Password must be at least 8 characters — enforce this on both frontend and backend
- On submit, backend checks:
  - Email is not already registered (return 409 if it is)
  - Username is not already taken (return 409 if it is)
- Password is hashed with **bcrypt** (cost factor 12) before storing — never store plaintext
- New user is created with `role = 'user'` and `approved = false`
- User sees a message: "Your account is pending approval by the admin"
- User cannot log in until admin approves their account

### Login
- User submits `email` + `password`
- Backend checks:
  - Email exists in database
  - `approved` flag is `true` — if not, return 403 with "Account pending approval"
  - Password matches hash via bcrypt compare
- On success, server returns a signed **JWT** containing: `{ userId, username, role, iat, exp }`
- Token expiry: **7 days**
- Token is stored in an **httpOnly cookie** (not localStorage — httpOnly cookies are not accessible to JavaScript, which protects against XSS attacks)
- Return user object to frontend (without password hash): `{ id, username, email, role }`

### Session Persistence
- On every page load, frontend checks for a valid session by calling `GET /api/auth/me`
- Backend reads the httpOnly cookie, verifies the JWT, returns current user or 401
- Frontend stores the user in global state (React context) and uses it to conditionally render UI

### Logout
- `POST /api/auth/logout`
- Backend clears the httpOnly cookie
- Frontend clears user from global state and redirects to home

### Middleware
- Create an `authenticate` middleware that runs before protected routes
- It reads the JWT from the cookie, verifies it, and attaches `req.user` to the request
- Create an `requireAdmin` middleware that checks `req.user.role === 'admin'` — used for admin-only routes
- Create a `requireApproved` middleware that checks `req.user.approved === true`

### Password Reset (must-have but simple version)
- "Forgot password" link on login page
- User enters email → backend generates a secure random token, stores it with an expiry (1 hour), sends email with reset link
- Reset link contains the token as a URL param
- User sets new password → backend verifies token is valid and not expired → updates hash → invalidates token
- Use **Nodemailer** for sending emails (configure with an SMTP provider — Resend or Brevo both have free tiers)

---

## 2. Role System & Permissions

### Roles
Two roles only: `admin` and `user`.

| Action | Admin | Approved User | Unapproved User | Logged-out visitor |
|---|---|---|---|---|
| Read posts | ✅ | ✅ | ✅ | ✅ |
| Comment | ✅ | ✅ | ❌ | ❌ |
| Create post | ✅ | ✅ | ❌ | ❌ |
| Edit own post | ✅ | ✅ | ❌ | ❌ |
| Delete own post | ✅ | ✅ | ❌ | ❌ |
| Edit any post | ✅ | ❌ | ❌ | ❌ |
| Delete any post | ✅ | ❌ | ❌ | ❌ |
| Delete any comment | ✅ | ❌ | ❌ | ❌ |
| Access admin panel | ✅ | ❌ | ❌ | ❌ |
| Approve users | ✅ | ❌ | ❌ | ❌ |

### Important Implementation Note
Enforce permissions **on the backend**, not just the frontend. Never trust the frontend alone to hide or show buttons — the API must independently verify permissions on every request. Frontend hiding is for UX only.

### First Admin
The very first registered user should automatically become admin, OR you hardcode your own email in an environment variable and the backend auto-assigns admin role if that email registers. Do not build an admin registration UI — it's a security risk.

---

## 3. Post System

### Data Model
Each post has:
- `id` — auto-generated UUID
- `title` — plain text, max 200 characters, required
- `slug` — URL-safe version of the title, auto-generated, must be unique (e.g. "my-first-post"). If slug collision, append `-2`, `-3` etc.
- `body` — rich text stored as HTML (output from Tiptap editor)
- `excerpt` — plain text summary, max 300 characters. Auto-generated from first 300 chars of body (strip HTML tags), but author can override it manually
- `cover_image` — URL string pointing to uploaded image, nullable
- `status` — enum: `'draft'` or `'published'`
- `author_id` — foreign key to users table
- `created_at` — timestamp set on creation
- `updated_at` — timestamp updated on every edit
- `published_at` — timestamp set when status changes to published, nullable

### Creating a Post
- Route: `POST /api/posts`
- Requires: authenticated + approved user
- Accepts: `{ title, body, excerpt, cover_image, status, tags }`
- `status` defaults to `'draft'` if not provided
- Tags are passed as an array of strings: `["javascript", "personal"]`
  - For each tag: find or create it in the tags table, then create the post_tag join record
- Returns the created post with author and tags populated

### Editing a Post
- Route: `PUT /api/posts/:slug`
- Requires: authenticated user who is either the post author OR admin
- Accepts same fields as creation
- If title changes, regenerate slug only if the new slug doesn't conflict
- `updated_at` is always refreshed

### Deleting a Post
- Route: `DELETE /api/posts/:slug`
- Requires: post author or admin
- Hard delete — remove post, its post_tags, and all its comments from the database
- Return 204 No Content on success

### Fetching Posts (public)
- Route: `GET /api/posts`
- Returns only `status = 'published'` posts
- Supports query params:
  - `?tag=javascript` — filter by tag slug
  - `?author=username` — filter by author
  - `?page=1&limit=10` — pagination (default limit: 10)
- Each post in the list returns: `id, title, slug, excerpt, cover_image, published_at, author (username only), tags`
- Does NOT return full body in list — only on single post fetch (performance)

### Fetching Single Post (public)
- Route: `GET /api/posts/:slug`
- Returns full post including body, author details, tags, and comments
- If post is `draft`, only return it to the author or admin — return 404 to everyone else

### Draft Management
- Route: `GET /api/posts/drafts` — returns current user's own drafts only
- This is the "My Drafts" view in the writing interface

### The Editor
Use **Tiptap** as the rich text editor. It must support:
- Bold, italic, underline, strikethrough
- Headings (H1, H2, H3)
- Bullet lists, ordered lists
- Blockquotes
- Horizontal rule
- Code blocks with **syntax highlighting** — use Tiptap's CodeBlockLowlight extension with highlight.js
- Links (with ability to set href)
- Images inline (optional for MVP — can be added later)
Tiptap outputs HTML. Store that HTML in the database. When rendering posts, sanitize the HTML before displaying it using **DOMPurify** (on the client) or **sanitize-html** (on the server) to prevent XSS attacks.

---

## 4. Comment System

### Data Model
Each comment has:
- `id` — UUID
- `body` — plain text only, no rich text, max 2000 characters
- `post_id` — foreign key to posts
- `author_id` — foreign key to users
- `created_at` — timestamp
- `updated_at` — timestamp

### Creating a Comment
- Route: `POST /api/posts/:slug/comments`
- Requires: authenticated + approved user
- Body must not be empty and must be under 2000 characters
- Return the created comment with author username and created_at

### Deleting a Comment
- Route: `DELETE /api/comments/:id`
- Admin can delete any comment
- Post author can delete any comment on their own post
- Comment author can delete their own comment
- Anyone else gets 403

### Editing a Comment
- Route: `PUT /api/comments/:id`
- Only the comment author can edit their own comment
- Show an "edited" indicator on the frontend if `updated_at !== created_at`

### Fetching Comments
- Comments are returned with the single post fetch (`GET /api/posts/:slug`)
- Ordered by `created_at` ascending (oldest first — chronological thread)
- Return for each comment: `id, body, author (username, id), created_at, updated_at`

### Frontend Behavior
- Comment box is visible only to logged-in approved users — show "Log in to comment" to others
- After submitting, optimistically add the comment to the list without full page reload
- Show comment count on post cards in the listing page

---

## 5. Admin Panel

The admin panel is a separate section of the site accessible only to users with `role = 'admin'`. Route it under `/admin`. Any request to `/admin/*` from a non-admin user redirects to home.

### Pending User Approvals
- List of users with `approved = false`, ordered by registration date
- For each: show username, email, registered date
- Two actions per user: **Approve** or **Reject**
  - Approve: sets `approved = true`
  - Reject: deletes the user record entirely
- Route: `GET /api/admin/pending-users`
- Route: `PUT /api/admin/users/:id/approve`
- Route: `DELETE /api/admin/users/:id`

### User Management
- List of all approved users
- Show: username, email, role, join date, post count
- Admin can change a user's role between `user` and `admin`
- Admin can delete a user (deletes their posts and comments too — cascade)
- Route: `GET /api/admin/users`
- Route: `PUT /api/admin/users/:id/role`

### Post Management
- List of ALL posts regardless of status, ordered by newest
- Show: title, author, status, created date, comment count
- Admin can delete any post
- Admin can change any post's status (publish/unpublish)
- Route: `GET /api/admin/posts`
- Route: `DELETE /api/admin/posts/:id`
- Route: `PUT /api/admin/posts/:id/status`

### Comment Management
- List of all comments, ordered by newest
- Show: comment excerpt, post title, author, date
- Admin can delete any comment
- Route: `GET /api/admin/comments`
- Route: `DELETE /api/admin/comments/:id`

---

## 6. Reading Experience & Frontend

### Post Listing Page (`/`)
- Shows published posts, newest first, paginated (10 per page)
- Each post card shows: cover image (if exists), title, excerpt, author username, published date, reading time, tags, comment count
- Tags are clickable and filter the listing
- "Load more" button or numbered pagination — your choice, but implement one

### Single Post Page (`/posts/:slug`)
- Full post title, cover image, author, date, reading time, tags
- Full rendered body (sanitized HTML from Tiptap)
- Syntax highlighted code blocks
- Comment section below the post
- Reading time: calculate as `Math.ceil(wordCount / 200)` minutes

### Reading Time Calculation
Strip HTML tags from body, count words, divide by 200 (average reading speed), round up. Display as "X min read".

### Slug-Based Routing
Astro handles this with dynamic routes: `src/pages/posts/[slug].astro`. The page fetches the post data from the backend API on the server side using Astro's `Astro.props` and server-side fetch.

### Code Syntax Highlighting
On the frontend, use **highlight.js** or **Shiki** to highlight code blocks rendered from the post body. Shiki is recommended — it produces better output and integrates naturally with Astro.

### Responsive Layout
The site must be fully usable on mobile. Key breakpoints:
- Mobile: < 640px — single column, full width
- Tablet: 640–1024px — content centered, max-width 700px
- Desktop: > 1024px — content centered, max-width 720px, optionally a sidebar

### Typography
This is a reading-focused site. Typography is the most important design element:
- Body font: something readable and slightly characterful — **Lora**, **Source Serif 4**, or **Newsreader** (all free on Google Fonts)
- UI font (nav, buttons, labels): clean sans-serif — **DM Sans** or **Outfit**
- Code font: **JetBrains Mono** or **Fira Code**
- Base font size: 18px for post body — do not go smaller
- Line height: 1.7–1.8 for body text
- Max line length: ~680px (keeps lines readable, roughly 65–70 characters)

---

## 7. Project Structure

```
/
├── frontend/               ← Astro project
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro          ← post listing
│   │   │   ├── posts/
│   │   │   │   └── [slug].astro     ← single post
│   │   │   ├── write.astro          ← editor page
│   │   │   ├── drafts.astro         ← my drafts
│   │   │   ├── login.astro
│   │   │   ├── register.astro
│   │   │   └── admin/
│   │   │       ├── index.astro      ← admin dashboard
│   │   │       ├── users.astro
│   │   │       └── posts.astro
│   │   ├── components/
│   │   │   ├── PostCard.astro
│   │   │   ├── CommentSection.tsx   ← React island (interactive)
│   │   │   ├── Editor.tsx           ← React island (Tiptap)
│   │   │   ├── AuthForms.tsx        ← React island (login/register)
│   │   │   └── Nav.astro
│   │   └── layouts/
│   │       └── BaseLayout.astro
│
├── backend/                ← Node.js/Express project
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── posts.js
│   │   │   ├── comments.js
│   │   │   └── admin.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js
│   │   │   ├── requireAdmin.js
│   │   │   └── requireApproved.js
│   │   ├── db/
│   │   │   ├── index.js             ← pg pool setup
│   │   │   └── schema.sql           ← full schema
│   │   └── index.js                 ← Express app entry
│   ├── .env
│   └── package.json
```

---

## 8. Database Schema (Full)

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(250) UNIQUE NOT NULL,
  body TEXT NOT NULL,
  excerpt VARCHAR(300),
  cover_image TEXT,
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  slug VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE post_tags (
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL CHECK (char_length(body) <= 2000),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false
);

-- Indexes for common queries
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_comments_post ON comments(post_id);
```

---

## 9. Environment Variables

Backend `.env` must contain:
```
DATABASE_URL=postgresql://user:password@localhost:5432/blogdb
JWT_SECRET=a-long-random-string-at-least-32-characters
PORT=3001
ADMIN_EMAIL=your@email.com        ← auto-assigned admin on first register
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FRONTEND_URL=http://localhost:4321 ← for CORS config
```

---

## 10. API Security Checklist

Every API endpoint must:
- Validate and sanitize all inputs (use **express-validator**)
- Return appropriate HTTP status codes (200, 201, 204, 400, 401, 403, 404, 409, 500)
- Never expose stack traces or internal errors to the client in production
- Rate limit auth endpoints (login, register, password reset) using **express-rate-limit** — max 10 requests per 15 minutes per IP
- Set CORS to only allow requests from the frontend URL
- Set `secure: true` and `sameSite: 'strict'` on cookies in production
