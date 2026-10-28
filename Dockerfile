FROM node:22-bookworm-slim AS build

WORKDIR /workspace
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,target=/root/.npm \
  npm ci --fetch-retries=4 --fetch-retry-mintimeout=15000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000

COPY . .
RUN npm run build --workspace @collab/shared \
  && npm run build --workspace @collab/api \
  && npm run build --workspace @collab/web

FROM node:22-bookworm-slim AS api
WORKDIR /workspace
ENV NODE_ENV=production
COPY --from=build /workspace /workspace
EXPOSE 4000
CMD ["sh", "-c", "npm run db:migrate:deploy --workspace @collab/api && npm run start --workspace @collab/api"]

FROM nginx:alpine AS web
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
