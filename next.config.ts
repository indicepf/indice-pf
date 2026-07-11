import type { NextConfig } from "next";

// Content-Security-Policy — começa em Report-Only para calibrar sem quebrar.
// Depois de validar no console do navegador (sem violações reais), trocar o
// header para "Content-Security-Policy" (bloqueante). Fontes permitidas:
//  - Supabase (REST/Storage/Realtime), Nominatim (geocoding reverso do mapa)
//  - GTM/GA4 (script gtm.js; coleta em *.google-analytics.com e
//    *.analytics.google.com; pixels de fallback via img)
//  - 'unsafe-inline' em script/style: o Next injeta estilos e scripts inline;
//    remover exige nonce por request (migração maior, fica para depois)
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.supabase.co https://www.googletagmanager.com https://*.google-analytics.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
