# Multi-stage Dockerfile for AugmentOS React Example App

# Stage 1: Build stage
FROM oven/bun:1.1-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package.json ./
# Don't copy lockfile - let Bun generate it fresh in the container
# This avoids Windows/Linux lockfile format incompatibilities

# Install all dependencies
RUN bun install

# Copy application code
COPY . .

# Build the React frontend
RUN bun run build

# Stage 2: Production stage
FROM oven/bun:1.1-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install production dependencies only
RUN bun install --production

# Copy application code and built assets
COPY --chown=nodejs:nodejs . .
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port (default 3000)
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["bun", "run", "src/index.ts"]
