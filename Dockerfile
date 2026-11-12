# syntax=docker/dockerfile:1
# Pinned by digest so a rebuild gets the exact image that was reviewed. Bump tag and digest together.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Everything, for building.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
# Placeholders only so `next build` can load server modules; the real values come from .env at runtime.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:5432/build SETTINGS_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 npm run build \
  && rm -rf .next/cache

# Only what runs: the app, the worker (TypeScript through tsx), migrations and the admin scripts.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
# Chromium and its system libraries, for reading job pages. Before the source so it stays cached across code changes.
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/* /tmp/*
COPY . .
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
RUN mkdir -p /app/data/assets && chown -R node:node /app/data
LABEL org.opencontainers.image.source="https://github.com/Eljakani/naruvi-app" \
      org.opencontainers.image.description="Naruvi: a self-hosted career workspace" \
      org.opencontainers.image.licenses="Apache-2.0"
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
