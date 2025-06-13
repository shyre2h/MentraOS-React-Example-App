# ---- Build stage ----
FROM oven/bun:1.1.0 AS builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build the frontend
RUN bun run build

# ---- Production stage ----
FROM oven/bun:1.1.0-slim
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bun

# Copy built application
COPY --from=builder --chown=bun:nodejs /app .

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Switch to non-root user
USER bun

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["bun", "run", "src/index.ts"]