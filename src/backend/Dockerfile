FROM node:18-alpine

WORKDIR /app

# Copy package files and install all dependencies (including dev dependencies) needed for building
COPY package*.json ./
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the project
RUN npm run build

# Remove dev dependencies to slim down the production image
RUN npm prune --production

EXPOSE 8080

CMD ["node", "dist/app.js"]