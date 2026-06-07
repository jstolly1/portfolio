/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow the dev server's /_next/* assets (JS chunks, HMR) to be served to a
  // phone hitting it through a cloudflared/ngrok HTTPS tunnel. Next 16 blocks
  // cross-origin dev requests by default (403 "Unauthorized"), which otherwise
  // breaks hydration on the tunnel domain. Dev-only; no effect on production.
  allowedDevOrigins: ['*.trycloudflare.com', '*.ngrok-free.app', '*.ngrok.io'],
};

export default nextConfig;
