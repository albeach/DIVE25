#!/bin/bash

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Build TypeScript
npm run build 