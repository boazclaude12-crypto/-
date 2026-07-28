import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  eslint:{
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images:{
    remotePatterns:[
      {
        protocol:'https',
        hostname:"sidfexwzfecuvvoeoffp.supabase.co",
        port:""
      }
    ]
  }
};

export default nextConfig;
