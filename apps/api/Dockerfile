FROM node:24-alpine AS build
WORKDIR /app
# Toolchain for native dependencies such as argon2 when a source build is needed.
RUN apk add --no-cache python3 make g++
# Copy manifests first so source edits can reuse the dependency installation layer.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @todo/contracts --workspace @todo/api
COPY api ./api
COPY packages/contracts ./packages/contracts
COPY apps/api ./apps/api
COPY migrations ./migrations
RUN npm run generate && npm run build -w @todo/contracts && npm run build -w @todo/api
RUN npm prune --omit=dev

# The runtime stage copies compiled output and production dependencies from the build stage.
FROM node:24-alpine AS runtime
RUN apk add --no-cache curl tini
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/api ./api
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
# Documents the container port; Compose or docker run publishes it on the host.
EXPOSE 8080
# Forward signals to Node and reap child processes when running as container PID 1.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
