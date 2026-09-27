const PRODUCTION_API_URL = "https://ai-school-lens-backend.vercel.app/api/v1";

function publicApiUrl() {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_API === "true") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  }
  return process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API_URL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    imageSizes: [16, 32, 48, 56, 64, 96, 128],
    remotePatterns: [
      { protocol: "https", hostname: "hawknexabackend.fynals.com", pathname: "/**" },
      { protocol: "http", hostname: "localhost", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/**" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: publicApiUrl(),
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  async rewrites() {
    if (process.env.NEXT_PUBLIC_USE_LOCAL_API === "true") {
      return [];
    }
    return [
      {
        source: "/api/v1/:path*",
        destination: `${publicApiUrl()}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
