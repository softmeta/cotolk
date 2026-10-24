FROM node:24.22.1-trixie-slim AS build
WORKDIR /source
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @cotolk/web...
RUN pnpm --filter @cotolk/web build
RUN pnpm --filter @cotolk/web deploy --prod /app

FROM node:24.22.1-trixie-slim
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app /app
COPY --from=build /source/apps/web/dist /app/dist
RUN printf '#!/bin/sh\nexec node --import tsx /app/server/cli.ts "$@"\n' > /usr/local/bin/cotolk \
  && chmod +x /usr/local/bin/cotolk
USER node
EXPOSE 3000
ENTRYPOINT ["cotolk"]
CMD ["web"]
