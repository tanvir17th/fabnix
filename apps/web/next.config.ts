import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// On Vercel (and any production build) the API origin must be explicit — the
// rewrites below are fixed at build time, so a missing value would silently
// point the live site at localhost.
if (process.env.VERCEL === '1' && !process.env.API_URL) {
  throw new Error('API_URL is not set. Add it in Vercel → Project → Settings → Environment Variables (e.g. https://api.yourdomain.com).');
}
const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * The API is proxied under the same origin (/api/v1, /media) so the httpOnly
 * refresh cookie (Path=/api/v1/auth, SameSite=Lax) works without CORS.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@fabnix/shared'],
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` },
      { source: '/media/:path*', destination: `${API_URL}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
