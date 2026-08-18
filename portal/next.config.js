const PRODUCTION_API_URL = "https://ai-school-lens-backend.vercel.app/api/v1";

function publicApiUrl() {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_API === "true") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  }
  return PRODUCTION_API_URL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: publicApiUrl(),
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${PRODUCTION_API_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
