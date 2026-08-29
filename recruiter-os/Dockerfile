# Recruiter OS — single long-running Node process with a persistent data volume.
# The database and uploaded CVs both live under /app/data, so that path must be a
# mounted volume; without it they are wiped on every deploy.
FROM node:22.22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_FILE=/app/data/recruiter.db
ENV UPLOAD_DIR=/app/data/uploads
# PORT is deliberately NOT set here. Hosts like Railway, Render and Fly inject it,
# and a baked-in value can win over theirs — the app would then listen on a port
# nothing routes to. Unset, `next start` uses $PORT when present and 3000 otherwise.

COPY --from=build /app/package.json /app/package-lock.json /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db

# Migrations run automatically on the first database connection.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
# No -p flag on purpose: `next start` binds to $PORT, so the host controls it.
CMD ["npx", "next", "start"]
