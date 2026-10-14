import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Uploaded proof is compressed in the browser and validated at 2 MB on
      // the server. Leave room for the action's serialized fields as well.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
