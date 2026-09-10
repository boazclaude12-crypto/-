FROM node:22-bookworm-slim AS build
WORKDIR /app

# The API URL is baked into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --workspace @ycf/web --include-workspace-root

COPY apps/web ./apps/web
RUN npm run build --workspace @ycf/web

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @ycf/web --include-workspace-root && npm cache clean --force

COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/next.config.mjs ./apps/web/
COPY --from=build /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web
RUN useradd --system --uid 10002 web && chown -R web /app
USER web

EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
