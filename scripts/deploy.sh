#!/usr/bin/env bash
# Deploys one release of the stack on the server (CLAUDE.md section 15).
#
#   scripts/deploy.sh <git tag>
#
# Run over SSH by .github/workflows/deploy.yml on every published release,
# and by hand the same way for a rollback: pass an older tag. Expects to
# live inside the git checkout the stack runs from (DEPLOY_PATH on the
# server), with the server's `.env` beside docker-compose.yml.
#
# Everything sits inside main() so bash parses the whole file before the
# `git checkout` below replaces it with the target release's copy - bash
# otherwise reads a script incrementally and would continue in the new
# file at the old byte offset.
set -euo pipefail

main() {
  local tag="${1:?usage: scripts/deploy.sh <git tag>}"
  cd "$(dirname "$0")/.."

  if [[ ! -f .env ]]; then
    echo "deploy: no .env in $PWD - create it from .env.example first" >&2
    exit 1
  fi

  local compose=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

  echo "==> checking out $tag"
  git fetch --tags --force origin
  git checkout --detach --quiet "$tag"

  # The bind mount's host directory must exist before `up`, or Docker
  # creates it as root and the worker (uid 1000) cannot write shots into it.
  # First-time ownership is set during server setup (docs/notes/deploy.md).
  mkdir -p .data/shots

  echo "==> building images"
  "${compose[@]}" build --pull

  echo "==> starting the stack"
  # `migrate` is a one-shot service that web and worker depend on with
  # service_completed_successfully, so every deploy re-runs the migrations
  # before the new web/worker containers start.
  "${compose[@]}" up -d --remove-orphans

  echo "==> removing dangling image layers from earlier builds"
  docker image prune -f >/dev/null

  echo "==> waiting for the web app"
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
      echo "==> deployed $tag"
      "${compose[@]}" ps
      return 0
    fi
    sleep 2
  done

  echo "deploy: web did not answer on 127.0.0.1:3000 within 60s" >&2
  "${compose[@]}" ps >&2
  "${compose[@]}" logs --tail 50 migrate web >&2
  exit 1
}

main "$@"
