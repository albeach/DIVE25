#!/bin/bash
set -e

# Build frontend
cd src/frontend
npm run build

# Build backend
cd ../backend
npm run build

# Create deployment package
cd ../..
tar -czf dive25-deploy.tar.gz \
    dist/ \
    src/backend/dist/ \
    docker-compose.prod.yml \
    .env.example \
    scripts/deploy-platform.sh \
    prisma/

# Upload to server
scp dive25-deploy.tar.gz root@dive25.com:/opt/dive25/
ssh root@dive25.com 'cd /opt/dive25 && \
    tar xzf dive25-deploy.tar.gz && \
    cp .env.example .env && \
    ./scripts/deploy-platform.sh' 