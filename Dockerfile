########################
# 1️⃣  Build / compile
########################
FROM oven/bun:1.1.0 AS builder
WORKDIR /app

# Copy only the manifest
COPY package.json ./

# ⬇️  Disable Bun’s implicit frozen-lockfile (set by CI=true)
ENV CI=""

# Install prod deps (creates a fresh bun.lockb, no freeze)
RUN bun install --production --no-save

# Copy the rest and build
COPY . .
RUN bun run build                              # vite → dist/frontend
RUN bun build src/index.ts \
      --outfile=dist/index.js \
      --target=node

########################
# 2️⃣  Runtime (Node with Brotli)
########################
FROM node:20-bullseye-slim
WORKDIR /app

COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
