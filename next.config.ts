import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise appends a generated block to CLAUDE.md, the one document every session reads as
  // authoritative. The brief is written by hand and nothing else writes to it.
  agentRules: false,
  // The link tiles (docs/design.md 3.27) read two font files from disk at render; the deployed function has to
  // carry them, and a `readFile` of a joined path is not something the tracer can follow on its own.
  outputFileTracingIncludes: { "/m/[id]/opengraph-image": ["./src/lib/ui/fonts/*"] },
  // A settlement photo arrives through a server action; the default 1MB would refuse most of them. The phone
  // shrinks anything over 3.5MB first, because the platform's own cap on a request is 4.5MB.
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // Dynamic's delegated-signing packages carry a native module and a wasm attestation binding that the bundler
  // cannot place; they are server-only and are loaded from node_modules at runtime instead (docs/decisions.md
  // 2026-09-27). Only the signer (`src/lib/chain/delegated-signer.ts`) imports them.
  serverExternalPackages: ["@dynamic-labs-wallet/node", "@dynamic-labs-wallet/node-evm", "@dynamic-labs-wallet/forward-mpc-client", "@evervault/wasm-attestation-bindings"],
};

export default nextConfig;
