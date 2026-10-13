import { PolicyPage } from "@/components/storefront/policy-page";
export const metadata = { title: "Privacy policy" };
export default function PrivacyPolicyPage() { return <PolicyPage title="Privacy policy" setting="policyPrivacy" fallback="The store privacy policy has not been configured yet. Please contact the showroom before sharing sensitive information." />; }
