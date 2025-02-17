#!/bin/bash
set -e

# Deploy to staging
DEPLOY_ENV="staging" \
DOMAIN="staging.dive25.com" \
./scripts/deploy-platform.sh

# Set up SSL
certbot --nginx \
  -d staging.dive25.com \
  -d api.staging.dive25.com \
  -d auth.staging.dive25.com \
  --non-interactive \
  --agree-tos \
  --email admin@dive25.com 