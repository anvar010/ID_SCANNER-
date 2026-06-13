import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Turbopack is default in Next.js 16+
  turbopack: {},
  allowedDevOrigins: ['192.168.1.19'],
  webpack: (config) => {
    // pdfjs-dist requires 'canvas' in Node but not in browser
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
