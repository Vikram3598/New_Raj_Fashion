import { PolicyPage } from "@/components/storefront/policy-page";
export const metadata = { title: "Terms and conditions" };
export default function TermsPage() { return <PolicyPage title="Terms and conditions" setting="policyTerms" fallback="The store terms have not been configured yet. Contact the showroom for current purchase terms." />; }
