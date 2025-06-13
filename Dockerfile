########################
# 1️⃣  deps stage – install prod deps using the LOCK FILE
########################
FROM oven/bun:1.1.0 AS deps
WORKDIR /app

# copy manifest & lockfile first to maximise cache hits
COPY package.json bun.lockb ./

# install ONLY prod deps, fail if lockfile/manifest diverge
RUN bun install --production --frozen-lockfile  \
    && bun pm cache clean                      # tiny layer

########################
# 2️⃣  build stage – compile React & TS backend
########################
FROM oven/bun:1.1.0 AS builder
WORKDIR /app

# re-use node_modules produced above
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# copy sources & build
COPY . .
RUN bun run build && \
    bun build src/index.ts --outfile=dist/index.js --target=node

########################
# 3️⃣  runtime stage – Node image (Brotli-enabled)
########################
FROM node:20-bullseye-slim
WORKDIR /app

# compiled output + exact dependency tree
COPY --from=builder /app/dist         ./dist
COPY --from=deps    /app/node_modules ./node_modules

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
