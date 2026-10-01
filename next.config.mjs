/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prototype: a stray type error should not block a Vercel deploy. Remove for production builds.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
