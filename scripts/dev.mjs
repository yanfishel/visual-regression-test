// One-command dev environment: `npm run dev` (or `npm run dev:clerk`).
// Starts postgres+redis in Docker, waits for readiness, applies migrations,
// then runs the web dev server and the worker (both with watchers) against
// localhost. Ctrl+C stops both; the containers stay up for the next start.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--mode=clerk") ? "clerk" : "none";

// The URLs in .env are compose-internal hostnames (postgres:5432, redis:6379)
// for the containerized services; host-run processes must use the published
// localhost ports instead, and a host-run worker must write shots to the
// bind-mounted host directory (CLAUDE.md section 7). Set in the child env,
// which wins over Next's .env-file loading.
const env = {
  ...process.env,
  AUTH_MODE: mode,
  DATABASE_URL: "postgres://vrt:vrt@localhost:5432/vrt",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_LOCAL_PATH: path.join(root, ".data", "shots"),
};

// Notifications: the worker sends the e-mails and, being a bare Node process,
// loads no .env file (CLAUDE.md "Daily commands"). Forward exactly the two
// SMTP variables from the root .env so `npm run dev` can send real mail. They
// go into the env of *both* children below, which wins over Next's .env-file
// loading, so under `npm run dev` the root .env alone is enough - only a bare
// `next dev` needs them in apps/web/.env too. APP_URL is where the dev server
// listens.
env.APP_URL ??= "http://localhost:3000";
for (const key of ["SMTP_URL", "MAIL_FROM"]) {
  if (env[key] === undefined) {
    const value = readRootEnvValue(key);
    if (value !== undefined) env[key] = value;
  }
}

function readRootEnvValue(key) {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && match[1] === key) {
      return match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return undefined;
}

// Docker Desktop on Windows doesn't always land on PATH (known on this
// machine); fall back to its default install location.
function findDocker() {
  const candidates =
    process.platform === "win32"
      ? ["docker", "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe"]
      : ["docker"];
  for (const candidate of candidates) {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) {
      return candidate;
    }
  }
  console.error("Docker CLI not found - start Docker Desktop or add docker to PATH.");
  process.exit(1);
}

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) {
    console.error(`\`${command} ${args.join(" ")}\` exited with ${result.status ?? "signal"}`);
    process.exit(result.status ?? 1);
  }
}

const docker = findDocker();
runOrExit(docker, ["compose", "up", "-d", "postgres", "redis"]);

// Same probe as the compose healthcheck; `up -d` returns before it passes.
process.stdout.write("Waiting for postgres ");
const deadline = Date.now() + 30_000;
for (;;) {
  const probe = spawnSync(docker, ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "vrt"], {
    cwd: root,
    stdio: "ignore",
  });
  if (probe.status === 0) {
    break;
  }
  if (Date.now() > deadline) {
    console.error("\npostgres did not become ready within 30s");
    process.exit(1);
  }
  process.stdout.write(".");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log("ready");

mkdirSync(env.STORAGE_LOCAL_PATH, { recursive: true });

// npm is a .cmd shim on Windows, which Node refuses to spawn without a
// shell; the command strings below contain no user input or spaces.
runOrExit("npm run db:migrate", [], { env, shell: true });

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

// One process dying takes the other down: a half-running dev environment is
// more confusing than a stopped one.
function start(command) {
  const child = spawn(command, [], { cwd: root, env, stdio: "inherit", shell: true });
  children.push(child);
  child.on("exit", (code) => shutdown(code ?? 0));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`\nStarting web (AUTH_MODE=${mode}) and worker with watchers...\n`);
start("npm run dev -w @vrt/web");
start("npm run dev -w @vrt/worker");
