/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api',
  },
  // Для статических файлов из старого проекта
  async rewrites() {
    return [
      {
        source: '/styles.css',
        destination: '/api/static/styles.css',
      },
    ];
  },
};

module.exports = nextConfig;
