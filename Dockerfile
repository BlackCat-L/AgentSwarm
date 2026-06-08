# ── Agent Swarm Dark Factory Dockerfile ────────────────────
# Multi-stage build for minimal production image

FROM node:22-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/cli/package.json packages/cli/
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/packages/server/dist ./server
COPY --from=builder /app/packages/web/dist ./web
COPY --from=builder /app/packages/cli/dist ./cli
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=5120
EXPOSE 5120

CMD ["node", "server/index.js"]
