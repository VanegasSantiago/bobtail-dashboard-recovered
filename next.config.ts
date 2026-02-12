import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  poweredByHeader: false,

  // Reduce bundle size by not including source maps in production
  productionBrowserSourceMaps: false,

  // Experimental features for stability
  experimental: {
    // Improve server component reliability
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // Optimize images
  images: {
    remotePatterns: [],
  },

  // Ensure proper error handling
  onDemandEntries: {
    // Keep pages in memory longer to avoid recompilation issues
    maxInactiveAge: 60 * 1000, // 60 seconds
    pagesBufferLength: 5,
  },
};

export default nextConfig;
