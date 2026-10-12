// Preloaded into the local indexer by scripts/dev/indexer-on-loopback.mjs (NODE_OPTIONS="--import <this file>", with
// DAREFUL_LISTEN_ON_LOOPBACK=1): every server the process starts on a port listens on 127.0.0.1 alone, whatever host it
// named or left out, so `envio dev`'s own port (9898) is reachable from this Mac and nowhere else. Envio has no setting for
// the host: it calls app.listen(port). Loaded without the variable (a test), it only hands over the rule.
import net from "node:net";

const isPort = (v) => typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v));
/** A host that is this Mac's alone: a loopback address or its name. */
const isHere = (host) => typeof host === "string" && (/^127\./.test(host) || host === "::1" || host === "[::1]" || host === "localhost");

/**
 * A `listen` call's arguments with its host made 127.0.0.1 unless it already named this Mac alone: none, every interface
 * and any other address all become 127.0.0.1. A path (a Unix socket) and a handle are left as they are. Pure.
 */
export function onLoopback(args) {
  const out = [...args];
  const first = out[0];
  if (first === undefined || typeof first === "function") out.unshift(0, "127.0.0.1");
  else if (isPort(first)) {
    if (typeof out[1] !== "string") out.splice(1, 0, "127.0.0.1");
    else if (!isHere(out[1])) out[1] = "127.0.0.1";
  } else if (first !== null && typeof first === "object" && isPort(first.port ?? 0) && first.path === undefined && first.fd === undefined && first.handle === undefined && first._handle === undefined) {
    if (!isHere(first.host)) out[0] = { ...first, host: "127.0.0.1" };
  }
  return out;
}

if (process.env.DAREFUL_LISTEN_ON_LOOPBACK === "1") {
  const listen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    return listen.apply(this, onLoopback(args));
  };
}
