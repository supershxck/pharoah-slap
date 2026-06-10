# Pharaoh Slap — single-service container (WebSocket game server + accounts + client)
# Node 22 is required: db.js uses the built-in node:sqlite module (no native builds,
# so Alpine works and the image stays small). The --experimental-sqlite flag makes
# the import work across all 22.x releases regardless of when it stopped needing it.
FROM node:22-alpine

WORKDIR /app

# Install production dependencies first (better layer caching).
# There is no package-lock.json, so use `npm install` rather than `npm ci`.
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# App source (client + server). .dockerignore keeps junk/local data out.
COPY . .

# SQLite lives on a volume so accounts/progress survive container restarts.
RUN mkdir -p /data && chown -R node:node /data /app

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/pharaoh.db
    # JWT_SECRET is intentionally NOT baked in. If unset, the server generates an
    # ephemeral one (tokens won't survive a restart). Pass -e JWT_SECRET=... in prod.

USER node
EXPOSE 8080
VOLUME ["/data"]

# Container health: the server answers /health with 200 OK.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health >/dev/null 2>&1 || exit 1

CMD ["node", "--experimental-sqlite", "server.js"]
