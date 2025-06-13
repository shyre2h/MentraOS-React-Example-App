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
FROM node:18-bullseye-slim AS production
WORKDIR /app

# 3) Copy only what we need for production
COPY package.json ./
RUN npm ci --omit=dev

# 4) Copy the compiled output from builder
COPY --from=builder /app/dist-frontend ./public
COPY --from=builder /app/dist-backend ./dist

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 5) Run under Node (whose zlib.createBrotliDecompress *is* implemented)
CMD ["node", "dist/index.js"]
