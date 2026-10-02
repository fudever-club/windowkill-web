# WINDOWKILL backend — Fly.io deploy (free tier, persistent SQLite)
#
# BUILD CONTEXT = REPO ROOT (the COPY paths below start with `server/`).
# Deploy from the repo root, e.g.:
#   fly deploy --config server/deploy/fly.toml --dockerfile server/deploy/Dockerfile
# (see server/README.md for the full one-time setup)
FROM node:24-slim
WORKDIR /app
# Zero dependencies — nothing to install; package.json is copied only so
# `node` resolves the module type/metadata the same way as in local runs.
COPY server/package.json ./package.json
COPY server/src ./src
ENV HOST=0.0.0.0 \
    PORT=3001 \
    WK_DB=/data/windowkill.db
# CORS allowlist lives in fly.toml [env] (WK_CORS_ORIGINS) so origins can be
# changed without rebuilding the image; it must include the itch.io game
# iframe origin https://html-classic.itch.zone (finding B6).
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/index.js"]
