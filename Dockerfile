FROM node:24-bookworm-slim AS build
ARG TUYAN_PREVIEW_ORIGIN
ARG TUYAN_REVISION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --filter @paperbanana/web... --filter @paperbanana/paperbanana-api... --filter @paperbanana/benchmark-worker... --frozen-lockfile
RUN test -n "$TUYAN_PREVIEW_ORIGIN" && test -n "$TUYAN_REVISION" \
 && VITE_TUYAN_PREVIEW_ORIGIN="$TUYAN_PREVIEW_ORIGIN" VITE_API_BASE="$TUYAN_PREVIEW_ORIGIN" VITE_AUTH_BASE="$TUYAN_PREVIEW_ORIGIN" VITE_AUTH_ENABLED=true VITE_AUTH_REQUIRED=true VITE_PUBLIC_LEADERBOARD_ENABLED=false VITE_BASE_PATH=/ pnpm --filter @paperbanana/web build
RUN pnpm --filter @paperbanana/paperbanana-api build \
 && pnpm --filter @paperbanana/paperbanana-api deploy --prod --legacy /out/core \
 && printf '{"codeSha":"%s"}\n' "$TUYAN_REVISION" > /out/core/build-provenance.json \
 && printf '{"revision":"%s","target":"Tashan preview","origin":"%s"}\n' "$TUYAN_REVISION" "$TUYAN_PREVIEW_ORIGIN" > apps/web/dist/version.json

FROM node:24-bookworm-slim AS gateway
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /opt/gateway
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/auth-gateway/package.json apps/auth-gateway/package.json
COPY packages/tuyan-knowledge/package.json packages/tuyan-knowledge/package.json
COPY packages/figure-taxonomy/package.json packages/figure-taxonomy/package.json
RUN pnpm install --filter @paperbanana/auth-gateway --prod --frozen-lockfile
COPY apps/auth-gateway apps/auth-gateway
COPY packages/tuyan-knowledge packages/tuyan-knowledge
COPY packages/figure-taxonomy packages/figure-taxonomy
COPY packages/api/src/workspace-*.mjs packages/api/src/

FROM mongo:8.0-noble AS mongo
FROM ubuntu:24.04
ARG TUYAN_PREVIEW_ORIGIN
ARG TUYAN_REVISION
RUN apt-get update && apt-get install -y --no-install-recommends nginx libreoffice-impress libreoffice-writer fontconfig ca-certificates libcurl4t64 libgssapi-krb5-2 libsasl2-2 libssl3t64 libldap2 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --uid 1001 --create-home preview \
 && groupadd --gid 999 mongodb \
 && useradd --uid 999 --gid 999 --no-create-home mongodb
COPY --from=mongo /usr/bin/mongod /usr/bin/mongod
RUN mongod --version
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=1001:1001 /out/core /opt/core
RUN ln -s /opt/core /app
COPY --from=gateway --chown=1001:1001 /opt/gateway /opt/gateway
COPY --from=build /workspace/apps/web/dist /opt/web
COPY deploy/tashan /opt/preview
ENV NODE_ENV=production TZ=Asia/Shanghai TUYAN_PREVIEW_ORIGIN=$TUYAN_PREVIEW_ORIGIN TUYAN_REVISION=$TUYAN_REVISION
WORKDIR /opt/preview
RUN node /opt/core/assets/svg-review/smoke.cjs && node /opt/core/assets/material-reader/smoke.mjs
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=10s --start-period=180s --retries=3 CMD ["node", "/opt/preview/health.mjs"]
ENTRYPOINT ["node", "/opt/preview/start.mjs"]
