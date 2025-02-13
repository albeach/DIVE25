FROM node:18-alpine AS builder

WORKDIR /app

# Copy only package files initially to allow for dependency caching
COPY package.json package-lock.json ./

# Clean install dependencies, then switch to production
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Start fresh for production image
FROM node:18-alpine

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]