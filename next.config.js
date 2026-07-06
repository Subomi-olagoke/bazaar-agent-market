const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this app so a parent lockfile on the Desktop
  // doesn't get inferred as the root under Turbopack.
  turbopack: {
    root: __dirname,
  },
  // @croo-network/sdk is a soft/optional dependency, only lazy-import()ed inside
  // the LIVE adapter. Mark it external on the server so a missing or unbuildable
  // package never breaks `next build` — the app must always build in SIM.
  serverExternalPackages: ['@croo-network/sdk'],
};

module.exports = nextConfig;
