FROM node:22-slim
WORKDIR /repo

# npm ci needs every workspace's package.json present (the lockfile covers
# the whole monorepo), and fails loudly if the lockfile is missing or out of
# sync - npm install would silently resolve fresh versions instead.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/mail/package.json packages/mail/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db

USER node
WORKDIR /repo/packages/db
CMD ["npm", "run", "migrate"]
