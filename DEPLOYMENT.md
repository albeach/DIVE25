# DIVE25 Deployment Guide

## Prerequisites

1. Domain Setup
- Register dive25.com domain
- Configure DNS with your provider (Cloudflare recommended)
- Add A records for:
  - dive25.com
  - *.dive25.com
  - api.dive25.com
  - auth.dive25.com

2. Server Requirements
- Ubuntu 20.04 LTS or newer
- Minimum 4GB RAM
- 2 CPU cores
- 40GB SSD storage

3. Required Software
- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+
- NGINX
- Certbot

## Deployment Steps

1. Initial Server Setup 