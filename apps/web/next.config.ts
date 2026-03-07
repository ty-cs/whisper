import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@whisper/crypto'],
  /* config options here */
  reactCompiler: true,
};

export default nextConfig;
