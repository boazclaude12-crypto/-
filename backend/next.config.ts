import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint:{
    ignoreDuringBuilds: true,
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
