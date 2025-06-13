############################
# —— 1. Build / compile stage ——
############################
FROM oven/bun:1.1.0 AS builder
WORKDIR /app

# 1-a  install *production-only* deps (fast, reproducible, Brotli not required here)
COPY bun.lock package.json ./
RUN bun install --frozen-lockfile --production       # node_modules/ populated

# 1-b  copy source and run both builds
COPY . .

# Build the React frontend → dist/frontend/  (per vite.config.ts)
RUN bun run build

# Transpile the backend TypeScript → dist/index.js
# bun build ignores the "noEmit": true in tsconfig and outputs plain JS.
RUN bun build src/index.ts --outfile=dist/index.js --target=node

############################
# —— 2. Runtime stage ——
############################
FROM node:20-bullseye-slim AS runtime
WORKDIR /app

# 2-a  copy compiled code + static assets
COPY --from=builder /app/dist ./dist          # backend JS  +  dist/frontend/**
# (if you keep a “public/” folder with static assets:)
# COPY --from=builder /app/public ./public

# 2-b  copy production node_modules resolved by Bun
COPY --from=builder /app/node_modules ./node_modules
COPY package.json .                            # keeps metadata for tooling

ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "import('http').then(({createServer})=>{const s=createServer((_,r)=>r.end()).listen(3000,()=>{r.end();s.close();});});"

# 2-c  start your app (now plain JS, Brotli-capable zlib)
CMD ["node", "dist/index.js"]
