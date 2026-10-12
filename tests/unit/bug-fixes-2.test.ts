/**
 * Pre-submission bug fixes 2 (docs/decisions.md 2026-10-12), the parts that need no database: the PIN step's keypad and
 * its wait (section 0), the units row on You without a next time (section 1), and the local indexer's start with every
 * port it opens on 127.0.0.1 (section 1): the rule each piece keeps, and its socket to Docker run against a stand-in
 * Docker on a socket of the test's own.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { nobodyToPickWords, pinAfterKey } from "@/components/markets/hand-over-steps";
import { nobodyToPick } from "@/lib/ledger/hand-over";
import { ownUnitOf } from "@/lib/ledger/settings";
import { createOnLoopback, dockerProxy, dockerSocketOf, listeningBeyond, onlyHere, publishedBeyond } from "../../scripts/dev/indexer-on-loopback.mjs";
import { onLoopback } from "../../scripts/dev/listen-on-loopback.mjs";

const read = (path: string) => readFileSync(path, "utf8");

test("the PIN's keypad: a digit adds itself up to four, Delete takes one off, the digit that makes the fourth sends, and while a PIN is on its way no key does anything (section 0)", () => {
  assert.deepEqual(pinAfterKey("", "4", false), { pin: "4", send: false });
  assert.deepEqual(pinAfterKey("42", "4", false), { pin: "424", send: false }, "the third sends nothing");
  assert.deepEqual(pinAfterKey("424", "2", false), { pin: "4242", send: true }, "the fourth digit sends");
  assert.deepEqual(pinAfterKey("4242", "1", false), { pin: "4242", send: false }, "a fifth is nothing, and never a second send");
  assert.deepEqual(pinAfterKey("424", "back", false), { pin: "42", send: false });
  assert.deepEqual(pinAfterKey("", "back", false), { pin: "", send: false });
  assert.deepEqual(pinAfterKey("4242", "back", true), { pin: "4242", send: false }, "held: Delete does nothing");
  assert.deepEqual(pinAfterKey("424", "2", true), { pin: "424", send: false }, "held: a digit does nothing, so nothing sends twice");
});

test("an empty Who's joining? is everyone in only when the host has people here and every one is in; a host with people out of it, or nobody yet, hears that none has pass the phone on, and how a friend turns it on (section 0, the owner's addition)", () => {
  assert.equal(nobodyToPick({ people: 3, notInYet: 0 }), "all_in");
  assert.equal(nobodyToPick({ people: 3, notInYet: 2 }), "none_on", "people not in, none with it on");
  assert.equal(nobodyToPick({ people: 0, notInYet: 0 }), "none_on", "nobody here yet: nobody they know has it on, and nobody is in");
  assert.deepEqual(nobodyToPickWords("all_in", "Sam"), { line: "Everyone this was sent to is in already.", how: null });
  assert.deepEqual(nobodyToPickWords("none_on", "Sam"), { line: "None of Sam’s people have pass the phone on yet.", how: "A friend turns it on from their own phone: You, then Pass the phone." });
  assert.ok(read("src/app/m/[id]/pass/page.tsx").includes("nobody={picks.empty}") && read("src/components/markets/hand-over.tsx").includes("empty={nobody}"), "the server's reason reaches the sheet");
});

test("handing the phone over waits as every tap does: the keypad held from the fourth digit, the tally past a third of a second, the line at three, our own words at a minute, and a thrown request answered in words (section 0)", () => {
  const src = read("src/components/markets/hand-over.tsx");
  assert.ok(src.includes('const wait = buttonWait(useWaitStage(holding === "sent"), "write");'), "the button's own stages, as a write");
  assert.ok(src.includes('counting={holding === "sent" && wait.pending} line={holding === "sent" ? wait.line : null}'), "the tally and the line from those stages, only while a PIN is on its way");
  assert.ok(src.includes("const next = pinAfterKey(pin, k, held.current);"), "the keypad reads the hold in the tap itself");
  assert.ok(src.includes("    if (!friend || !picked || held.current) return;\n    held.current = true;"), "a send holds before anything else, and a second is refused");
  assert.ok(src.includes("const r = await attempt(() => enterFromHostAction(dareId, picked.position, friend.id, full));"), "a request that throws answers words, and never leaves the keypad held");
  assert.ok(src.includes("      setProblem(WORDS.server);\n    }, GIVE_UP_MS);"), "no answer in a minute says it failed on our end and frees the keypad");
  assert.ok(src.includes('      setHolding("leaving");\n      setProblem("That PIN is paused for an hour.");'), "a lock holds the keypad while the screen leaves");
});

test("the units row on You names no next time, which left the stakes in the final round, and a next time is never a unit of your own nor said to be offered (section 1)", () => {
  for (const path of ["src/app/you/page.tsx", "src/components/you/account.tsx"]) assert.ok(!/next time/i.test(read(path)), `${path} names a next time`);
  assert.ok(read("src/app/you/page.tsx").includes('"Beers, coffees, rounds, dollars: whatever a cover or a question runs on"'));
  assert.ok(read("src/components/you/account.tsx").includes("Nothing yet. A unit is whatever a cover or a question runs on: a beer, a coffee, a round, dollars."));
  for (const typed of ["next time", "A next time", "Next  times"]) assert.deepEqual(ownUnitOf(typed, []), { error: "A next time can’t be a stake." }, typed);
  assert.deepEqual(ownUnitOf("rounds", []), { error: "That one’s offered already." }, "what the stakes do offer is still said to be offered");
});

test("the local indexer's rules: a create's every port on 127.0.0.1, publishing everything or the VM's own network refused, and every published or listening address read for what reaches beyond this Mac (section 1)", () => {
  assert.equal(onlyHere("127.0.0.1") && onlyHere("[::1]") && onlyHere("::1"), true);
  assert.equal(onlyHere("0.0.0.0") || onlyHere("::") || onlyHere("192.168.1.20") || onlyHere("*"), false);
  // Envio 3.12's own create for its Postgres, as Docker's inspect of it read on October 11.
  const envio = { Image: "postgres:18.3", HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5433" }] }, RestartPolicy: { Name: "always" } } };
  const made = createOnLoopback(envio);
  assert.ok("body" in made);
  assert.deepEqual(made.body.HostConfig.PortBindings, { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "5433" }] }, "every port on 127.0.0.1");
  assert.deepEqual([made.body.Image, made.body.HostConfig.RestartPolicy], ["postgres:18.3", { Name: "always" }], "nothing else of Envio's changes");
  assert.deepEqual(createOnLoopback({ HostConfig: { PortBindings: { "8080/tcp": [{ HostIp: "", HostPort: "8080" }, { HostIp: "::", HostPort: "8080" }, { HostIp: "192.168.1.20", HostPort: "8081" }] } } }), { body: { HostConfig: { PortBindings: { "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }, { HostIp: "127.0.0.1", HostPort: "8081" }] } } } }, "every interface, IPv6's and one address all made 127.0.0.1, a port kept once");
  assert.deepEqual(createOnLoopback({ HostConfig: { PublishAllPorts: true } }), { refused: "asks to publish every port it exposes" });
  assert.deepEqual(createOnLoopback({ HostConfig: { NetworkMode: "host" } }), { refused: "asks for the VM's own network" });
  assert.deepEqual(publishedBeyond({ HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5433" }] } }, NetworkSettings: { Ports: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5433" }, { HostIp: "::", HostPort: "5433" }] } } }), ["0.0.0.0:5433", "[::]:5433"], "Envio's own, as it made them");
  assert.deepEqual(publishedBeyond({ HostConfig: { PortBindings: { "8080/tcp": [{ HostIp: "", HostPort: "8080" }] } } }), ["0.0.0.0:8080"], "no address is every interface");
  assert.deepEqual(publishedBeyond({ HostConfig: { PublishAllPorts: true, PortBindings: {} } }), ["every port"]);
  assert.deepEqual(publishedBeyond({ HostConfig: { PortBindings: { "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] } }, NetworkSettings: { Ports: { "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }] } } }), [], "on 127.0.0.1 alone");
  assert.deepEqual(listeningBeyond("p31605\nf26\nn127.0.0.1:9898\np52147\nf8\nn*:53\nf9\nn[::1]:8080\nn192.168.1.20:3000\n"), ["*:53", "192.168.1.20:3000"], "lsof's own lines: every interface and an address beyond, never loopback");
  assert.equal(dockerSocketOf("unix:///tmp/docker.sock"), "/tmp/docker.sock");
  assert.throws(() => dockerSocketOf("tcp://10.0.0.2:2375"), /Unix socket/);
  assert.equal(dockerSocketOf(undefined, "/nobody-lives-here"), "/var/run/docker.sock", "Colima's socket when it is there, else Docker's own");
});

test("the local indexer's own port: a server with no host, every interface or another address listens on 127.0.0.1, and a socket path or a loopback host is left alone (section 1)", () => {
  assert.deepEqual(onLoopback([9898]), [9898, "127.0.0.1"], "Envio's app.listen(port)");
  const done = () => undefined;
  assert.deepEqual(onLoopback([9898, done]), [9898, "127.0.0.1", done]);
  assert.deepEqual(onLoopback([9898, 511]), [9898, "127.0.0.1", 511], "a backlog is not a host");
  assert.deepEqual(onLoopback(["9898", "0.0.0.0"]), ["9898", "127.0.0.1"]);
  assert.deepEqual(onLoopback([9898, "::"]), [9898, "127.0.0.1"]);
  assert.deepEqual(onLoopback([9898, "192.168.1.20"]), [9898, "127.0.0.1"], "an address beyond this Mac too");
  assert.deepEqual(onLoopback([{ port: 9898 }]), [{ port: 9898, host: "127.0.0.1" }]);
  assert.deepEqual(onLoopback([{ port: 9898, host: "::" }]), [{ port: 9898, host: "127.0.0.1" }]);
  assert.deepEqual(onLoopback([]), [0, "127.0.0.1"], "no arguments is any port, on every interface");
  for (const args of [[9898, "127.0.0.1"], [9898, "localhost"], [9898, "::1"], ["/tmp/indexer.sock"], [{ path: "/tmp/indexer.sock" }], [{ port: 9898, host: "127.0.0.1" }]]) assert.deepEqual(onLoopback(args), args, JSON.stringify(args));
  const preload = read("scripts/dev/listen-on-loopback.mjs");
  assert.ok(preload.includes('if (process.env.DAREFUL_LISTEN_ON_LOOPBACK === "1") {') && preload.includes("return listen.apply(this, onLoopback(args));"), "loaded by the indexer's start, every listen goes through the rule");
});

test("the local indexer's socket to Docker: a create reaches Docker with every port on 127.0.0.1, one it cannot make so never reaches it, everything else passes as it came, and a hijacked stream is joined both ways (section 1)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "loopback-"));
  const dockerAt = join(dir, "docker.sock");
  const proxyAt = join(dir, "proxy.sock");
  const creates: unknown[] = [];
  // A stand-in Docker: it keeps every create's body, answers a list, and on a hijack says 101 and echoes the stream upper-cased.
  const docker = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.url?.includes("/containers/create")) {
        creates.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        res.writeHead(201, { "content-type": "application/json" });
        return res.end(JSON.stringify({ Id: "abc" }));
      }
      res.writeHead(200, { "content-type": "application/json", "x-docker": "stand-in" });
      res.end(JSON.stringify([{ Id: "abc", seen: req.url }]));
    });
  });
  const streams: net.Socket[] = [];
  docker.on("upgrade", (_req, socket: net.Socket) => {
    streams.push(socket);
    socket.write("HTTP/1.1 101 UPGRADED\r\nContent-Type: application/vnd.docker.raw-stream\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n");
    socket.on("data", (d: Buffer) => socket.write(d.toString("utf8").toUpperCase()));
    // Docker ends the stream once the client has ended its half, as `docker exec -i` expects.
    socket.on("end", () => socket.end());
  });
  await new Promise<void>((done) => docker.listen(dockerAt, done));
  const seen: unknown[] = [];
  const proxy = await dockerProxy({ listenOn: proxyAt, docker: dockerAt, seen: (c: unknown) => seen.push(c) });
  const call = (method: string, path: string, body?: unknown) =>
    new Promise<{ status: number; json: unknown; headers: http.IncomingHttpHeaders }>((done, fail) => {
      const req = http.request({ socketPath: proxyAt, method, path, headers: body ? { "content-type": "application/json" } : {} }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => done({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")), headers: res.headers }));
      });
      req.on("error", fail);
      req.end(body ? JSON.stringify(body) : undefined);
    });
  try {
    const made = await call("POST", "/v1.54/containers/create?name=envio-postgres", { Image: "postgres:18.3", HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "5433" }] } } });
    assert.deepEqual([made.status, made.json], [201, { Id: "abc" }], "Docker's answer, as it gave it");
    assert.deepEqual(creates, [{ Image: "postgres:18.3", HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "5433" }] } } }], "Docker was asked for 127.0.0.1");
    assert.deepEqual(seen, [{ name: "envio-postgres", ports: ["127.0.0.1:5433->5432/tcp"] }]);
    const refused = await call("POST", "/containers/create?name=wide", { Image: "x", HostConfig: { PublishAllPorts: true } });
    assert.equal(refused.status, 403);
    assert.ok(/Refused by the loopback socket: wide asks to publish every port it exposes\./.test((refused.json as { message: string }).message));
    assert.equal(creates.length, 1, "and Docker never heard it");
    const notJson = await new Promise<number>((done) => {
      const req = http.request({ socketPath: proxyAt, method: "POST", path: "/containers/create?name=odd" }, (res) => (res.resume(), done(res.statusCode ?? 0)));
      req.end("not json");
    });
    assert.deepEqual([notJson, creates.length], [403, 1], "a body that cannot be read is refused, never sent on");
    const listed = await call("GET", "/v1.54/containers/json?all=true");
    assert.deepEqual([listed.status, listed.json, listed.headers["x-docker"]], [200, [{ Id: "abc", seen: "/v1.54/containers/json?all=true" }], "stand-in"], "everything else passes as it came, both ways");
    // Bounded: a stream the socket drops or never joins answers what it got within a few seconds, never a hung run.
    const echoed = await new Promise<string>((done) => {
      const s = net.connect(proxyAt, () => s.write("POST /v1.54/exec/abc/start HTTP/1.1\r\nHost: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 0\r\n\r\n"));
      let got = "";
      const give = () => (clearTimeout(timer), s.destroy(), done(got));
      const timer = setTimeout(give, 3_000);
      s.on("data", (d: Buffer) => {
        got += d.toString("utf8");
        if (got.includes("\r\n\r\n") && !got.includes("SELECT 1")) s.write("select 1");
        if (got.includes("SELECT 1")) give();
      });
      s.on("close", give);
      s.on("error", give);
    });
    assert.ok(echoed.startsWith("HTTP/1.1 101") && echoed.endsWith("SELECT 1"), "docker exec -i: Docker's 101, then the stream both ways");
  } finally {
    for (const s of streams) s.destroy();
    proxy.closeAllConnections();
    docker.closeAllConnections();
    await Promise.all([new Promise((done) => proxy.close(done)), new Promise((done) => docker.close(done))]);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("npm run indexer:dev is the start on 127.0.0.1, and CLAUDE.md's environment section points at it (section 1)", () => {
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  assert.equal(scripts["indexer:dev"], "node scripts/dev/indexer-on-loopback.mjs");
  const brief = read("CLAUDE.md");
  const env = brief.slice(brief.indexOf("## Environment"), brief.indexOf("## Repository layout"));
  assert.ok(env.includes("scripts/dev/indexer-on-loopback.mjs"), "the environment section names the script");
  const start = read("scripts/dev/indexer-on-loopback.mjs");
  assert.ok(start.includes('const env = { ...process.env, DOCKER_HOST: `unix://${sock}`, DAREFUL_LISTEN_ON_LOOPBACK: "1", NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${preload}`.trim() };'), "Envio reaches Docker through the socket, with the preload");
  assert.ok(start.includes("    const beyond = publishedBeyond(c.inspect);\n    if (beyond.length === 0) continue;"), "a container from an earlier run beyond 127.0.0.1 is made again");
  assert.ok(start.includes("        stop(`Stopping: ${problems.join(\"; \")}.`, 1);"), "and anything that reaches beyond while it runs stops the lot");
});
