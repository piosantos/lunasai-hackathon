import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://lunasai-hackathon.onrender.com/:path*",
      },
    ]
  },
};

export default nextConfig;
