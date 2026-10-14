import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/i18n/locale-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "New Raj Fashion and Raj Saree Showroom",
    template: "%s | New Raj Fashion",
  },
  description:
    "Local fashion destination in Gandhi Chowk, Sidhi for everyday clothing, sarees, ethnic wear, suiting and shirting, and wedding collections.",
  openGraph: {
    title: "New Raj Fashion and Raj Saree Showroom",
    description: "Garments, sarees and wedding collections from Gandhi Chowk, Sidhi, Madhya Pradesh.",
    locale: "en_IN",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale = cookieStore.get("nrf_locale")?.value === "hi" ? "hi" : "en";
  return (
    <html lang={initialLocale === "hi" ? "hi-IN" : "en-IN"} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <LocaleProvider initialLocale={initialLocale}>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
