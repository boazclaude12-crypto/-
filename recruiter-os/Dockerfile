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
# su-exec lets the entrypoint fix the volume's ownership as root and then hand the
# process to the unprivileged user.
RUN apk add --no-cache su-exec
ENV NODE_ENV=production
ENV DATABASE_FILE=/app/data/recruiter.db
ENV UPLOAD_DIR=/app/data/uploads
# PORT is deliberately NOT set here. Hosts like Railway, Render and Fly inject it,
# and a baked-in value can win over theirs — the app would then listen on a port
# nothing routes to. Unset, `next start` uses $PORT when present and 3000 otherwise.
# See the EXPOSE line below: the advertised port has to match the injected one.

COPY --from=build /app/package.json /app/package-lock.json /app/next.config.mjs ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db

COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Migrations run automatically on the first database connection.
# No VOLUME instruction: Railway rejects Dockerfiles that declare one and wants the
# mount configured on its side instead. Other hosts mount over this directory just
# as happily, so creating it here is all that is needed anywhere.
RUN chmod +x /app/docker-entrypoint.sh \
 && mkdir -p /app/data && chown -R node:node /app/data
# 8080, to match the port the app will actually be listening on.
#
# EXPOSE is only a hint — it opens nothing and binds nothing — but a host with no
# explicit target port configured reads it to decide where to send traffic. Railway
# injects PORT=8080, so `next start` listens on 8080; a Dockerfile advertising 3000
# then sends the router to a port with nothing behind it, and every request comes
# back as a gateway error while the container logs a clean, healthy start. The two
# numbers have to agree, and this is the one of them that was only ever a guess.
EXPOSE 8080
# The entrypoint drops to the `node` user; it stays root only long enough to claim
# the mounted volume. No -p flag on purpose: `next start` binds to $PORT, so the
# host controls it.
#
# -H 0.0.0.0 is stated rather than assumed. A server bound to localhost is invisible
# from outside its own container, and the platform's router then answers every request
# with a gateway error while the process looks perfectly healthy from the inside —
# the one failure mode that cannot be diagnosed from the application at all. It is
# already the default; pinning it means a change to that default cannot cause it.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npx", "next", "start", "-H", "0.0.0.0"]
