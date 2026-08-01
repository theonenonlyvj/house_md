/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  serverExternalPackages: ['@moss-dev/moss', '@moss-dev/moss-core'],
};

export default nextConfig;
