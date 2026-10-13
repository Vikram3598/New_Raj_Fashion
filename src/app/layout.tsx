import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
