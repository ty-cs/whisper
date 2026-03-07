import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@whisper/crypto'],
  reactCompiler: true,
  async rewrites() {
    const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
