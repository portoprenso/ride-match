FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm --filter @ride-match/api... install --frozen-lockfile --ignore-scripts
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
COPY packages/contracts/tsconfig.json packages/contracts/tsconfig.json
COPY packages/contracts/src packages/contracts/src
RUN pnpm --filter @ride-match/contracts build && pnpm --filter @ride-match/api build
# Reinstall only the locked production graph; preserve workspace symlink layout.
FROM build AS production-dependencies
RUN rm -rf node_modules apps/api/node_modules packages/contracts/node_modules && pnpm --filter @ride-match/api... install --prod --offline --frozen-lockfile --ignore-scripts

FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532 AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3000
WORKDIR /app/apps/api
COPY --from=production-dependencies --chown=node:node /workspace/node_modules /app/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/migrations ./migrations
COPY --from=production-dependencies --chown=node:node /workspace/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=build --chown=node:node /workspace/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=build --chown=node:node /workspace/packages/contracts/dist /app/packages/contracts/dist
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD ["node", "dist/health/probe.js", "ready"]
CMD ["node", "dist/main.js"]
