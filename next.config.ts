import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise appends a generated block to CLAUDE.md, the one document every session reads as
  // authoritative. The brief is written by hand and nothing else writes to it.
  agentRules: false,
  // The link tiles (docs/design.md 3.27) and the public numbers' image (`/numbers`) read two font files from disk
  // at render; the deployed function has to carry them, and a `readFile` of a joined path is not something the
  // tracer can follow on its own. The health checks draw both once an hour, from the health route or the tick.
  outputFileTracingIncludes: { "/m/[id]/opengraph-image": ["./src/lib/ui/fonts/*"], "/numbers": ["./src/lib/ui/fonts/*"], "/api/health": ["./src/lib/ui/fonts/*"], "/api/tick": ["./src/lib/ui/fonts/*"] },
  experimental: {
    // A settlement photo arrives through a server action; the default 1MB would refuse most of them. The phone
    // shrinks anything over 3.5MB first, because the platform's own cap on a request is 4.5MB.
    serverActions: { bodySizeLimit: "5mb" },
    // Switching tabs is instant (docs/design.md 9.6): a root once visited is held for thirty seconds with its
    // content, and re-read silently after; every mutation revalidates the paths it changes, and pull-to-refresh
    // and the return to the foreground re-read the screen on their own (5.5).
    staleTimes: { dynamic: 30, static: 30 },
  },
  // Dynamic's delegated-signing packages carry a native module and a wasm attestation binding that the bundler
  // cannot place; they are server-only and are loaded from node_modules at runtime instead (docs/decisions.md
  // 2026-09-27). Only the signer (`src/lib/chain/delegated-signer.ts`) imports them.
  serverExternalPackages: ["@dynamic-labs-wallet/node", "@dynamic-labs-wallet/node-evm", "@dynamic-labs-wallet/forward-mpc-client", "@evervault/wasm-attestation-bindings"],
  // Development only: the loopback address is the one origin whose cookie jar is separate from localhost's, which
  // is how a session-less visitor (someone arriving from a link with no account, docs/design.md 3.17) is exercised
  // in the same browser that holds the signed-in session. Without it the page renders and never hydrates there.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
