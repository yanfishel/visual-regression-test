FROM node:22-slim AS deps
WORKDIR /repo
# npm ci needs every workspace's package.json present (the lockfile covers
# the whole monorepo), and fails loudly if the lockfile is missing or out of
# sync - npm install would silently resolve fresh versions instead.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/mail/package.json packages/mail/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
WORKDIR /repo/apps/web
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
