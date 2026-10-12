// The local indexer with every port it opens on 127.0.0.1 alone (pre-submission bug fixes 2). `npm run indexer:dev` runs this.
//
// `envio dev` (3.12) publishes its Postgres (5433) and Hasura (8080) containers on every interface: its native module asks
// Docker for HostIp 0.0.0.0 and has no setting for it, and Colima carries a container's 0.0.0.0 to every interface of this
// Mac. Its own server listens on 9898 with no host, so on every interface too. Here:
//   1. a container of Envio's from an earlier run that publishes beyond 127.0.0.1 is removed, its data volume kept, so
//      Envio makes it again;
//   2. Envio reaches Docker only through a socket of this script's own, which rewrites every container it creates to publish
//      on 127.0.0.1 and refuses one it cannot (publishing every port, or the VM's own network);
//   3. Envio is started with a preload (listen-on-loopback.mjs) that puts every server with no host, every interface or
//      another address on 127.0.0.1;
//   4. while it runs, every container's ports, the host's side of them and the process's own are read back, and anything
//      beyond 127.0.0.1 stops the lot.
// It loads .env.local as the old `with-env` start did, uses Colima's socket unless DOCKER_HOST names another, and stops Envio
// and its socket on Ctrl-C.
import { execFile, spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOOPBACK = "127.0.0.1";
/** The label Envio puts on every container it makes, with the hash of what it asked for. */
const ENVIO_LABEL = "dev.envio.config-hash";

/** Whether an address a port is published or listened on is this Mac's alone. Pure. */
export function onlyHere(ip) {
  const bare = ip.replace(/^\[|\]$/g, "");
  return /^127\./.test(bare) || bare === "::1" || bare === "localhost";
}

/**
 * A container create request's body with every published port on 127.0.0.1, or why it is refused: publishing every port
 * it exposes (Docker would pick every interface) or the VM's own network (a listener there is carried to every interface of
 * this Mac). Two bindings of one port that become the same are kept once. Pure.
 */
export function createOnLoopback(body) {
  const host = body?.HostConfig ?? {};
  if (host.PublishAllPorts) return { refused: "asks to publish every port it exposes" };
  if (host.NetworkMode === "host") return { refused: "asks for the VM's own network" };
  const ports = Object.fromEntries(
    Object.entries(host.PortBindings ?? {}).map(([port, list]) => {
      if (!Array.isArray(list)) return [port, list];
      const seen = new Set();
      const here = [];
      for (const b of list) {
        const key = String(b?.HostPort ?? "");
        if (seen.has(key)) continue;
        seen.add(key);
        here.push({ ...b, HostIp: LOOPBACK });
      }
      return [port, here];
    }),
  );
  return { body: { ...body, HostConfig: { ...host, PortBindings: ports } } };
}

/** What a container (its inspect) publishes beyond this Mac, as "0.0.0.0:5433" or "[::]:5433"; "every port" when it publishes all it exposes. Pure. */
export function publishedBeyond(inspect) {
  const out = new Set();
  if (inspect?.HostConfig?.PublishAllPorts) out.add("every port");
  for (const ports of [inspect?.HostConfig?.PortBindings, inspect?.NetworkSettings?.Ports]) {
    for (const list of Object.values(ports ?? {})) {
      for (const b of list ?? []) {
        const ip = b?.HostIp || "0.0.0.0";
        if (!onlyHere(ip)) out.add(`${ip.includes(":") ? `[${ip}]` : ip}:${b?.HostPort ?? ""}`);
      }
    }
  }
  return [...out];
}

/** The listening addresses in `lsof -nP -F n` output that reach beyond this Mac ("*:9898" is every interface). Pure. */
export function listeningBeyond(lsof) {
  const out = new Set();
  for (const line of lsof.split("\n")) {
    if (!line.startsWith("n")) continue;
    const addr = line.slice(1).trim();
    const at = addr.lastIndexOf(":");
    if (at <= 0) continue;
    if (!onlyHere(addr.slice(0, at))) out.add(addr);
  }
  return [...out];
}

/** The socket a DOCKER_HOST names, else Colima's (the setup CLAUDE.md documents), else Docker's own. */
export function dockerSocketOf(dockerHost, home = homedir()) {
  if (dockerHost) {
    if (!dockerHost.startsWith("unix://")) throw new Error(`DOCKER_HOST is ${dockerHost}; this script speaks to Docker over a Unix socket only.`);
    return dockerHost.slice("unix://".length);
  }
  const colima = join(home, ".colima", "default", "docker.sock");
  return existsSync(colima) ? colima : "/var/run/docker.sock";
}

/** One call to Docker's API over its socket, answering the status and the parsed body. */
function dockerCall(socketPath, method, path) {
  return new Promise((done, fail) => {
    const req = http.request({ socketPath, method, path, headers: { host: "docker" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        done({ status: res.statusCode ?? 0, json });
      });
    });
    req.on("error", fail);
    req.end();
  });
}

const HOP = new Set(["connection", "keep-alive", "transfer-encoding"]);
const CREATE = /^(\/v[\d.]+)?\/containers\/create(\?|$)/;

/**
 * Docker's API on a socket of this script's own, passed through to Docker's: every container create is rewritten to publish
 * on 127.0.0.1 (`createOnLoopback`) or refused with a 403 and never sent on; every other request, streams and the hijacked
 * ones `docker exec -i` uses included, goes through as it came. `seen` hears every create, made or refused.
 * @param {{ listenOn: string; docker: string; seen?: (c: { name: string; refused: string } | { name: string; ports: string[] }) => void }} opts
 * @returns {Promise<http.Server>}
 */
export function dockerProxy({ listenOn, docker, seen = () => {} }) {
  const server = http.createServer((req, res) => {
    const forward = (body) => {
      const headers = { ...req.headers };
      if (body !== null) {
        delete headers["transfer-encoding"];
        headers["content-length"] = String(Buffer.byteLength(body));
      }
      const up = http.request({ socketPath: docker, method: req.method, path: req.url, headers }, (answer) => {
        const back = {};
        for (const [k, v] of Object.entries(answer.headers)) if (!HOP.has(k) && v !== undefined) back[k] = v;
        res.writeHead(answer.statusCode ?? 502, back);
        answer.pipe(res);
      });
      up.on("error", (err) => {
        if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: `Docker did not answer: ${err.message}` }));
      });
      if (body !== null) up.end(body);
      else req.pipe(up);
    };
    if (req.method !== "POST" || !CREATE.test(req.url ?? "")) return forward(null);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const name = new URL(req.url ?? "/", "http://docker").searchParams.get("name") ?? "a container";
      let made;
      try {
        made = createOnLoopback(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        made = { refused: "sent a body that is not JSON" };
      }
      if ("refused" in made) {
        seen({ name, refused: made.refused });
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: `Refused by the loopback socket: ${name} ${made.refused}.` }));
        return;
      }
      seen({ name, ports: Object.entries(made.body.HostConfig?.PortBindings ?? {}).flatMap(([p, list]) => (list ?? []).map((b) => `${b.HostIp}:${b.HostPort}->${p}`)) });
      forward(JSON.stringify(made.body));
    });
  });
  // A hijacked request (`docker exec -i`, an attach) becomes a raw stream after Docker's 101: its head is written to Docker's socket and the two are joined.
  server.on("upgrade", (req, socket, head) => {
    const up = net.connect(docker, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      up.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    // Each half ends the other's as it ends (a `docker exec -i` closes its input, then reads to the end); a side gone is both gone.
    const end = () => {
      up.destroy();
      socket.destroy();
    };
    up.on("error", end);
    socket.on("error", end);
    up.on("close", end);
    socket.on("close", end);
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(listenOn, () => done(server));
  });
}

/** Envio's containers, running or not, with their inspect. */
async function envioContainers(docker) {
  const list = await dockerCall(docker, "GET", `/containers/json?all=true&filters=${encodeURIComponent(JSON.stringify({ label: [ENVIO_LABEL] }))}`);
  if (list.status !== 200 || !Array.isArray(list.json)) throw new Error(`Docker answered ${list.status} to the list of containers.`);
  const out = [];
  for (const c of list.json) {
    const ins = await dockerCall(docker, "GET", `/containers/${c.Id}/json`);
    if (ins.status === 200 && ins.json) out.push({ id: c.Id, name: (c.Names?.[0] ?? c.Id).replace(/^\//, ""), inspect: ins.json });
  }
  return out;
}

function lsof(args) {
  return new Promise((done) => execFile("lsof", args, (_err, stdout) => done(stdout ?? "")));
}

/** Everything the indexer opened that reaches beyond this Mac: its containers' ports, the host's side of them, and the process's own. */
async function beyondHere(docker, pid) {
  const problems = [];
  for (const c of await envioContainers(docker)) {
    for (const b of publishedBeyond(c.inspect)) problems.push(`${c.name} publishes ${b}`);
    for (const list of Object.values(c.inspect?.NetworkSettings?.Ports ?? {})) {
      for (const b of list ?? []) {
        if (!b?.HostPort) continue;
        for (const a of listeningBeyond(await lsof(["-nP", `-iTCP:${b.HostPort}`, "-sTCP:LISTEN", "-Fn"]))) problems.push(`this Mac listens for ${c.name} on ${a}`);
      }
    }
  }
  if (pid) for (const a of listeningBeyond(await lsof(["-nP", "-a", "-p", String(pid), "-iTCP", "-sTCP:LISTEN", "-Fn"]))) problems.push(`envio dev listens on ${a}`);
  return problems;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..", "..");
  if (existsSync(join(root, ".env.local"))) process.loadEnvFile(join(root, ".env.local"));
  const say = (line) => console.error(`[loopback] ${line}`);
  const docker = dockerSocketOf(process.env.DOCKER_HOST);
  if (!existsSync(docker)) {
    say(`Docker isn't answering at ${docker}. Start Colima first (colima start).`);
    process.exit(1);
  }

  // 1. A container from an earlier run that publishes beyond this Mac goes; its volume stays, so Envio makes it again here with its data.
  for (const c of await envioContainers(docker)) {
    const beyond = publishedBeyond(c.inspect);
    if (beyond.length === 0) continue;
    say(`${c.name} publishes ${beyond.join(", ")}: removing it (its data volume stays) so it is made again on ${LOOPBACK}.`);
    const gone = await dockerCall(docker, "DELETE", `/containers/${c.id}?force=true`);
    if (gone.status !== 204 && gone.status !== 404) throw new Error(`Docker answered ${gone.status} to removing ${c.name}.`);
  }

  // 2. Envio's own socket to Docker.
  const sock = join(tmpdir(), `dareful-docker-${process.pid}.sock`);
  if (existsSync(sock)) unlinkSync(sock);
  const proxy = await dockerProxy({ listenOn: sock, docker, seen: (c) => say("refused" in c ? `refused ${c.name}: it ${c.refused}` : `${c.name} publishes ${c.ports.join(", ") || "nothing"}`) });

  // 3. Envio, with the preload, through that socket.
  const preload = pathToFileURL(join(here, "listen-on-loopback.mjs")).href;
  const env = { ...process.env, DOCKER_HOST: `unix://${sock}`, DAREFUL_LISTEN_ON_LOOPBACK: "1", NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${preload}`.trim() };
  const indexer = join(root, "indexer");
  const child = spawn(process.execPath, [join(indexer, "node_modules", "envio", "bin.mjs"), "dev"], { cwd: indexer, stdio: "inherit", env });

  let stopping = false;
  const stop = (why, code) => {
    if (stopping) return;
    stopping = true;
    if (why) say(why);
    process.exitCode = code;
    child.kill("SIGINT");
    setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(null, 0));

  // 4. Read back what it opened: often while it starts, then once a minute.
  const startedAt = Date.now();
  let checking = false;
  const check = async () => {
    if (checking || stopping) return;
    checking = true;
    try {
      const problems = await beyondHere(docker, child.pid);
      if (problems.length > 0) {
        stop(`Stopping: ${problems.join("; ")}.`, 1);
        for (const c of await envioContainers(docker)) if (publishedBeyond(c.inspect).length > 0) await dockerCall(docker, "DELETE", `/containers/${c.id}?force=true`);
      }
    } catch (err) {
      say(`couldn't read back the ports: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      checking = false;
    }
  };
  const often = setInterval(() => {
    void check();
    if (Date.now() - startedAt > 180_000) clearInterval(often);
  }, 3_000);
  const rarely = setInterval(() => void check(), 60_000);

  child.on("exit", (code, signal) => {
    clearInterval(often);
    clearInterval(rarely);
    proxy.close();
    if (existsSync(sock)) unlinkSync(sock);
    if (process.exitCode === undefined) process.exitCode = code ?? (signal ? 0 : 1);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[loopback] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
