FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Development target (used by docker-compose.dev.yml)
FROM base AS development
RUN apk add --no-cache python3 make g++ linux-headers ffmpeg
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
EXPOSE 3000 9229

# Install build tools for native addons (argon2, sharp)
FROM base AS build-deps
RUN apk add --no-cache python3 make g++ linux-headers

# Install all dependencies
FROM build-deps AS install
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/
COPY packages/worker/package.json packages/worker/
COPY packages/web/package.json packages/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build all packages
FROM install AS build
COPY . .
RUN pnpm -r build

# Deploy API (production deps only)
FROM build AS api-deploy
RUN pnpm deploy --filter=@sms/api --prod /prod/api

# Deploy Worker (production deps only)
FROM build AS worker-deploy
RUN pnpm deploy --filter=@sms/worker --prod /prod/worker

# API production image
FROM base AS api-production
RUN apk add --no-cache ffmpeg wget
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
COPY --from=api-deploy --chown=appuser:appgroup /prod/api /app
COPY --from=build --chown=appuser:appgroup /app/packages/db/drizzle /app/drizzle
WORKDIR /app
USER appuser
EXPOSE 3000
CMD ["node", "dist/index.js"]

# Worker production image
FROM base AS worker-production
RUN apk add --no-cache ffmpeg
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
COPY --from=worker-deploy --chown=appuser:appgroup /prod/worker /app
WORKDIR /app
USER appuser
CMD ["node", "dist/index.js"]

# Web production image (nginx + built SPA assets)
FROM nginx:1.27-alpine AS web-production
RUN apk add --no-cache wget
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
