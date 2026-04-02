#!/bin/bash
set -e

# inVision U — Deploy to production server
# Usage: ./deploy.sh

SERVER="158.160.193.93"
USER="kkengesbek"
SSH_KEY="~/.ssh/vm_clawpets"
REMOTE_DIR="~/invision"

SSH_CMD="ssh -i $SSH_KEY -l $USER $SERVER"

echo "==> Deploying inVision U to $SERVER..."

# 1. Push latest code to GitHub
echo "==> Pushing to GitHub..."
git push origin main

# 2. Pull on server and rebuild
echo "==> Pulling latest code on server..."
$SSH_CMD "cd $REMOTE_DIR && git pull origin main"

# 3. Rebuild and restart (using prod compose with ML volume mount)
echo "==> Rebuilding containers (app only, ML model mounted as volume)..."
$SSH_CMD "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up --build -d"

# 4. Health check
echo "==> Waiting for services..."
sleep 5
$SSH_CMD "docker ps --filter 'name=invision' --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

echo ""
echo "==> Deploy complete!"
echo "    Frontend: http://$SERVER:3002"
echo "    Backend:  http://$SERVER:8090"
echo "    Swagger:  http://$SERVER:8090/docs"
