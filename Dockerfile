# Pinned by digest so a rebuild gets the exact image that was reviewed. Bump tag and digest together.
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS deps
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders only so `next build` can load server modules; the real values come from .env at runtime.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:5432/build SETTINGS_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 npm run build

FROM deps AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
RUN mkdir -p /app/data/assets && chown -R node:node /app/data /app/.next
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
