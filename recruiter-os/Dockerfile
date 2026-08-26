# Recruiter OS — single long-running Node process with a persistent data volume.
# The database and uploaded CVs both live under /app/data, so that path must be a
# mounted volume; without it they are wiped on every deploy.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_FILE=/app/data/recruiter.db
ENV UPLOAD_DIR=/app/data/uploads
# Hosts like Railway, Render and Fly assign the port at runtime via $PORT.
# 3100 is only the fallback for `docker run` on a laptop.
ENV PORT=3100

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db

# Migrations run automatically on the first database connection.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3100
# No -p flag on purpose: `next start` binds to $PORT, so the host controls it.
CMD ["npx", "next", "start"]
