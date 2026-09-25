import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise appends a generated block to CLAUDE.md, the one document every session reads as
  // authoritative. The brief is written by hand and nothing else writes to it.
  agentRules: false,
  // The link tiles (docs/design.md 3.27) read two font files from disk at render; the deployed function has to
  // carry them, and a `readFile` of a joined path is not something the tracer can follow on its own.
  outputFileTracingIncludes: { "/m/[id]/opengraph-image": ["./src/lib/ui/fonts/*"] },
};

export default nextConfig;
