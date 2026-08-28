# Pinned to match the Playwright npm package version exactly (1.48.0) -
# this image ships the browser binaries for that version. Bumping one
# without the other breaks capture at runtime.
# -noble (Ubuntu 24.04, glibc 2.39), not -jammy (22.04, glibc 2.35): odiff-bin's
# prebuilt Linux binary requires glibc >= 2.38 and fails to run on jammy.
FROM mcr.microsoft.com/playwright:v1.48.0-noble
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

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Set only after npm ci: with NODE_ENV=production npm omits devDependencies,
# and the worker runs TS directly through tsx, which lives there.
ENV NODE_ENV=production

# The Playwright image ships pwuser for exactly this - the worker executes
# arbitrary third-party page scripts and shouldn't do it as root.
USER pwuser
WORKDIR /repo/apps/worker
CMD ["npm", "run", "start"]
