# Deployment — full notes

Detailed write-up behind CLAUDE.md §15. The rules live there; this file
keeps the server setup, the GitHub side and the reasoning. Started
2026-08-28.

## Shape

One Debian VPS, Docker Engine + compose plugin, the repo cloned to
`/home/vrt/app` (`DEPLOY_PATH`; never a panel docroot — see the trap
below) under the unprivileged `vrt` user (no sudo, docker group), the app served by the host's
own reverse proxy from `127.0.0.1:${WEB_PORT:-3000}`. A published GitHub Release runs
`.github/workflows/deploy.yml`, which SSHes in and runs
`scripts/deploy.sh <tag>`. Images are built on the server; there is no
registry and no CI artefact. That was a deliberate choice over
build-in-Actions-push-to-GHCR: fewer moving parts for a single-server
install, at the cost of build time on the VPS.

## Server setup (Debian 12, once)

All as a sudo-capable user. Docker comes from Docker's own apt repository —
Debian's package is old and ships without the compose plugin.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Swap if the box has less than 4 GB (`free -h`) — `next build` inside the
web image and the Playwright base image are the memory hogs:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Known trap:** swap is not only about the build. The production box (3.8 GB,
shared with a database and three other Node apps) ran without it, and on
2026-08-31 the kernel killed a Chromium renderer mid-capture — which
Playwright never surfaced as an error, so a run hung for 27 hours and both
project schedules stopped firing (worker.md "Watchdogs"). The worker now
times that out and restarts itself; the swap is what stops it happening.

The app user (docker group, no sudo — an existing unprivileged user is
fine, `adduser --disabled-password --gecos "" vrt` otherwise) and the
checkout. Under root, `sudo -iu vrt <cmd>` is `su - vrt -c '<cmd>'`:

```bash
sudo usermod -aG docker vrt
sudo -iu vrt git clone https://github.com/yanfishel/visual-regression-test.git /home/vrt/app
sudo -iu vrt mkdir -p /home/vrt/app/.data/shots
sudo chown 1001:1001 /home/vrt/app/.data/shots
```

The last two lines are the `.data/shots` trap (§15). The worker runs as
`pwuser`, which is **uid 1001** in `mcr.microsoft.com/playwright:*-noble`
(Ubuntu 24.04 ships its own `ubuntu` user at 1000 — check with
`docker compose exec worker id`, don't assume); a bind-mount directory
that Docker creates on first `up` is root-owned and every `put` fails
with `EACCES: permission denied, mkdir '/data/shots/xx'`. `web` runs as
`node` (uid 1000) and only reads shots through the world-readable bits;
its one write, `releaseFaviconFile`, is best-effort by design and logs
the `EACCES`. `deploy.sh` keeps `mkdir -p`ing the directory so a wiped
one reappears, but ownership is set here, once.

`.env`, from the example, `chmod 600`:

```bash
sudo -iu vrt bash -c 'cp /home/vrt/app/.env.example /home/vrt/app/.env && chmod 600 /home/vrt/app/.env && nano /home/vrt/app/.env'
```

**Known trap:** Compose interpolates `$NAME` inside `.env` values. A
generated password with a `$` in it (`…$khD…`) reaches the containers
with that fragment replaced by an empty string, and the only sign is a
`WARN The "khD" variable is not set` on every compose command. Write
`$$` for a literal `$`, or generate secrets with `openssl rand -hex`.

Set `POSTGRES_PASSWORD` (Compose builds `DATABASE_URL` from the
`POSTGRES_*` values itself, so the example's `DATABASE_URL` line is
irrelevant here), `APP_URL=https://<domain>`, `AUTH_MODE` plus the three
`CLERK_*` keys in clerk mode, and both mail variables or neither (§4
"Notifications"). `WEB_PORT` is the host-side port the proxy talks to
(`127.0.0.1:<WEB_PORT>`, default 3000) — set it when something else on the
box already owns 3000 (`ss -ltnp | grep :3000`); `up` otherwise fails with
"failed to bind host port 127.0.0.1:3000/tcp: address already in use".
The container port stays 3000, only the host side moves.

The deploy SSH key is generated on the developer machine, not on the
server, so the private half never sits on the box:

```powershell
ssh-keygen -t ed25519 -C vrt-deploy -f $env:USERPROFILE\.ssh\vrt-deploy -N '""'
```

Public half into `~vrt/.ssh/authorized_keys` (`chmod 700 ~/.ssh`,
`600 authorized_keys`). Verify with
`ssh -i ~/.ssh/vrt-deploy vrt@<host> docker ps`.

The **server's host key** for the workflow's pinned `known_hosts` is a
different key from the user's: read it on the box rather than
`ssh-keyscan`ing it over the network (Windows' bundled OpenSSH also fails
the KEX negotiation against Debian 12):

```bash
echo "<domain>,<ip> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
```

Three fields — hosts, `ssh-ed25519`, the base64 key. **Known trap:** the
first field must match `DEPLOY_HOST` byte for byte (listing domain and IP
comma-separated covers both), and it is the *key*, not the
`SHA256:…` fingerprint `ssh-keygen -l` prints: a fingerprint there yields
a bare `Host key verification failed`, a key for another host name the
same, and a wrong key the loud "REMOTE HOST IDENTIFICATION HAS CHANGED"
banner — in that last case compare the fingerprint in the log with
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` before replacing
anything.

## GitHub side

Repository secrets (Settings → Secrets and variables → Actions):

| Secret               | Value                                          |
|----------------------|------------------------------------------------|
| `DEPLOY_HOST`        | domain or IP                                   |
| `DEPLOY_USER`        | `vrt`                                          |
| `DEPLOY_PATH`        | `/home/vrt/app`                                |
| `DEPLOY_SSH_KEY`     | the private key file, verbatim                 |
| `DEPLOY_KNOWN_HOSTS` | the `ssh-keyscan` line                         |

Nothing from `.env` goes to GitHub. The workflow passes the secrets to
its steps through `env:`, never interpolated into the shell script, and
validates the manual `tag` input against git ref characters before it
reaches the SSH command line.

## Releasing and rolling back

1. Merge to `master` (CI already ran there).
2. GitHub → Releases → Draft a new release → new tag `vX.Y.Z` on `master`
   → Publish. Publishing fires `deploy.yml`; a *draft* or *prerelease*
   does not deploy.
3. Watch the Actions run: the log shows the checkout, both builds, `up`,
   and the final `docker compose ps`. On failure the script prints
   `ps` plus the last 50 lines of `migrate` and `web`.

Rollback: Actions → Deploy → Run workflow → tag of the previous release.
The same on the server without GitHub:
`sudo -iu vrt /home/vrt/app/scripts/deploy.sh v1.2.3`. Migrations are
forward-only (drizzle), so a rollback past a schema change needs a
matching DB restore — there is no automation for that.

## Reverse proxy

The proxy is not part of the repo; it upstreams to `127.0.0.1:<WEB_PORT>`.
Whatever it is, `/api/events` is an SSE stream (§9 "Live updates"): nginx
needs `proxy_buffering off;` and a long `proxy_read_timeout` (e.g. `1h`)
on that location, `proxy_http_version 1.1` and `Connection ""`; otherwise
live updates stall behind the buffer or get cut by the default 60 s read
timeout. `X-Forwarded-Proto`/`Host` must be forwarded too — the app builds
absolute URLs from them.

**Known trap — the server runs a hosting panel (VestaCP/HestiaCP).** Its
nginx vhost is *generated* (`nginx → Apache :8443 → public_html`), which
is where the first 403 came from: the app never saw the request. Editing
the generated file is pointless — the panel rewrites it on the next
certificate renewal or domain edit. The durable fix is a custom **proxy
template**: copy `default.tpl`/`default.stpl` in
`<panel>/data/templates/web/nginx/` to `vrt.tpl`/`vrt.stpl`, replace their
`location /` (and drop the nested static-file `location ~* ...` — Next
serves its own assets — and `@fallback`) with the two locations above,
keep the `%ip%`/`%domain%`/`ssl_*`/`include` lines the panel fills in, then
`v-change-web-domain-proxy-tpl <user> <domain> vrt` and reload nginx. The
http template just `return 301 https://$host$request_uri;`. The
certificate is the panel's as well; nothing in the repo depends on it.

**Known trap — never clone into the panel's docroot** (`~/web/<domain>/
public_html`). The panel's Apache serves that directory on `:8443`
directly, reachable from the internet with the domain as SNI — the
checkout, `.env` included, was readable with
`curl -k --resolve <domain>:8443:<ip> https://<domain>:8443/.env` until
the clone moved to `/home/vrt/app`. Every secret that had been in that
`.env` was rotated afterwards (Postgres password via `ALTER USER` inside
the running container, since the volume keeps the old one; Clerk secret
key regenerated; new `CLERK_ENCRYPTION_KEY`). The checkout lives outside
any web root; `DEPLOY_PATH` names it.

## Why the script checks the tag out twice

The workflow's SSH command does `git fetch && git checkout <tag>` and only
then calls `scripts/deploy.sh <tag>`, which fetches and checks out again.
The first checkout makes the server run the deploy logic *of the release
being deployed*; the second exists so a hand-run rollback needs only the
tag. Because the script may replace itself during its own checkout, its
body lives in `main()` invoked on the last line (§15 trap).
