FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json ./apps/web/
# npm ci: clean install of exactly what package-lock.json records.
RUN npm ci --workspace @todo/contracts --workspace @todo/web
COPY packages/contracts ./packages/contracts
COPY api ./api
COPY apps/web ./apps/web
RUN npm run generate && npm run build -w @todo/contracts && npm run build -w @todo/web

FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
