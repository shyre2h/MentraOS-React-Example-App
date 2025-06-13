########################
# 1️⃣  Build / compile
########################
FROM oven/bun:1.1.0 AS builder
WORKDIR /app

# Copy only the manifest so Bun won’t see a stale bun.lockb
COPY package.json ./

# Install production deps WITHOUT touching / creating a lock-file
RUN bun install --production --no-save        # ← no lockfile, no freeze

# Bring in the rest of your sources and build
COPY . .
RUN bun run build                              # vite → dist/frontend
RUN bun build src/index.ts \
      --outfile=dist/index.js \
      --target=node                           # backend → dist/index.js

########################
# 2️⃣  Runtime (Node with Brotli)
########################
FROM node:20-bullseye-slim
WORKDIR /app

# Copy compiled output & the node_modules resolved by Bun
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules

# (If you have a public/ folder, add the next line)
# COPY --from=builder /app/public ./public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
