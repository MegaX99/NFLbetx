import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/teamlogos/nfl/500/**",
      },
      {
        protocol: "https",
        hostname: "ymuzjpkjuprsooswojpo.supabase.co",
        pathname: "/storage/v1/object/public/player-avatars/**",
      },
    ],
  },
};

export default nextConfig;
