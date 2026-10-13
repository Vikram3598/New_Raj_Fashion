import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const imagePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [{ protocol: "http", hostname: "localhost", port: "9000", pathname: "/**" }];
for (const value of [process.env.S3_ENDPOINT, process.env.S3_PUBLIC_URL]) {
  if (!value) continue;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "");
    const pattern = { protocol: url.protocol.slice(0, -1) as "http" | "https", hostname: url.hostname, ...(url.port ? { port: url.port } : {}), pathname: path ? `${path}/**` : "/**" };
    if (!imagePatterns.some((existing) => existing.protocol === pattern.protocol && existing.hostname === pattern.hostname && existing.port === pattern.port && existing.pathname === pattern.pathname)) imagePatterns.push(pattern);
  } catch { /* Invalid storage URLs are reported by the storage upload setup instead. */ }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: imagePatterns,
  },
  experimental: {
    cpus: 1,
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https: http://localhost:9000",
              "font-src 'self' data:",
              "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
              "frame-src https://api.razorpay.com https://checkout.razorpay.com",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;

