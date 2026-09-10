# Build stage — compiles TypeScript and generates the Prisma client.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @ycf/server --include-workspace-root

COPY apps/server ./apps/server
RUN npm run prisma:generate --workspace @ycf/server \
  && npm run build --workspace @ycf/server

# Runtime stage — FFmpeg is a hard requirement for rendering.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace @ycf/server --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

WORKDIR /app/apps/server
RUN useradd --system --uid 10001 factory \
  && mkdir -p /app/.work /app/.storage \
  && chown -R factory /app
USER factory

EXPOSE 4000
CMD ["node", "dist/main/api.js"]
