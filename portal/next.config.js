const PRODUCTION_API_URL = "https://ai-school-lens-backend.vercel.app/api/v1";

function publicApiUrl() {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim();
  if (process.env.VERCEL) return PRODUCTION_API_URL;
  return raw || PRODUCTION_API_URL;
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
