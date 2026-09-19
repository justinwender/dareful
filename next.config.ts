import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise appends a generated block to CLAUDE.md, the one document every session reads as
  // authoritative. The brief is written by hand and nothing else writes to it.
  agentRules: false,
};

export default nextConfig;
