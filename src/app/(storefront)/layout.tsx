import { Header } from "@/components/storefront/header";
import { Footer } from "@/components/storefront/footer";

export const dynamic = "force-dynamic";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
