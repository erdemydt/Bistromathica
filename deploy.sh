#!/bin/bash

# ============================================
# Bistromathica — Deploy Script
# Usage: ./deploy.sh
# Run this on your LOCAL machine after pushing changes
# Or run on the SERVER directly after git pull
# ============================================

set -e  # Exit immediately if any command fails
# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

PROJECT_DIR="$HOME/Bistromathica"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"

# ============================================
# STEP 1 — Pull latest code from GitHub
# ============================================
log "Pulling latest code..."
cd "$PROJECT_DIR" || error "Project directory not found: $PROJECT_DIR"
git pull origin main || error "Git pull failed"

# ============================================
# STEP 2 — Install dependencies (only if package.json changed)
# ============================================
log "Installing backend dependencies..."
cd "$BACKEND_DIR" || error "Backend directory not found"
npm install --omit=dev || error "Backend npm install failed"

log "Installing frontend dependencies..."
cd "$FRONTEND_DIR" || error "Frontend directory not found"
npm install || error "Frontend npm install failed"

# ============================================
# STEP 3 — Build frontend
# ============================================
log "Building frontend..."
cd "$FRONTEND_DIR"
npm run build || error "Frontend build failed"

# ============================================
# STEP 4 — Restart backend
# ============================================
log "Restarting backend..."
pm2 restart blog-backend || error "Failed to restart backend"

# ============================================
# STEP 5 — Restart frontend
# ============================================
log "Restarting frontend..."
pm2 restart blog-frontend || error "Failed to restart frontend"

# ============================================
# STEP 6 — Save PM2 process list
# ============================================
pm2 save

# ============================================
# STEP 7 — Health check
# ============================================
log "Running health check..."
sleep 3  # Give processes a moment to start

FRONTEND_STATUS=$(pm2 jlist | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    if p['name'] == 'blog-frontend':
        print(p['pm2_env']['status'])
" 2>/dev/null)

BACKEND_STATUS=$(pm2 jlist | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    if p['name'] == 'blog-backend':
        print(p['pm2_env']['status'])
" 2>/dev/null)

if [ "$FRONTEND_STATUS" = "online" ] && [ "$BACKEND_STATUS" = "online" ]; then
    log "Both processes are online ✓"
else
    warn "Process status — frontend: $FRONTEND_STATUS, backend: $BACKEND_STATUS"
    warn "Check logs with: pm2 logs"
fi

# Quick HTTP check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4321 2>/dev/null)
if [ "$HTTP_STATUS" = "200" ]; then
    log "Frontend responding on port 4321 ✓"
else
    warn "Frontend not responding on port 4321 (status: $HTTP_STATUS)"
    warn "Check logs: pm2 logs blog-frontend"
fi

API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/posts 2>/dev/null)
if [ "$API_STATUS" = "200" ]; then
    log "Backend API responding on port 3001 ✓"
else
    warn "Backend API not responding (status: $API_STATUS)"
    warn "Check logs: pm2 logs blog-backend"
fi

# ============================================
# Done
# ============================================
echo ""
log "Deploy complete. Site should be live at https://bistromathica.com"
echo ""
pm2 status
