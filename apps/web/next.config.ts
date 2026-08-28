import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These are TS source workspace packages, not pre-built - Next.js has to
  // transpile them itself instead of treating them as external.
  transpilePackages: ["@vrt/shared", "@vrt/db", "@vrt/storage", "@vrt/mail"],
  serverExternalPackages: ["sharp"],
  // Produces a self-contained .next/standalone build for the Docker image.
  output: "standalone",
  webpack(config) {
    // Workspace packages use NodeNext-style relative imports ("./schema.js"
    // resolving to schema.ts), which tsc/tsx understand natively but
    // webpack does not without this alias.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
