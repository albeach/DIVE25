FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Generate Prisma client and build
RUN npx prisma generate
RUN npm run build

CMD ["npm", "start"] 