import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Both are barrel packages imported across ~40 sites; without this the
    // whole barrel is pulled in and re-compiled on every change.
    optimizePackageImports: ["lucide-react", "radix-ui"],
  },
};

export default nextConfig;
