/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // ws must load from node_modules at runtime — bundling it breaks its native
  // optional deps (bufferutil.mask crash on first frame send).
  serverExternalPackages: ['ws'],
};
