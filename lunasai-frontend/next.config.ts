import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://0.0.0.0:8080/:path*",
      },
    ]
  },
};

export default nextConfig;
