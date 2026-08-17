const PRODUCTION_API_URL = "https://ai-school-lens-backend.vercel.app/api/v1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.VERCEL && /localhost|127\.0\.0\.1/.test(process.env.NEXT_PUBLIC_API_URL || "")
        ? PRODUCTION_API_URL
        : process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API_URL,
  },
};

module.exports = nextConfig;
