import { PolicyPage } from "@/components/storefront/policy-page";
export const metadata = { title: "Shipping policy" };
export default function ShippingPolicyPage() { return <PolicyPage title="Shipping policy" setting="policyShipping" fallback="Shipping methods, delivery estimates and charges have not been configured yet. Please contact the showroom before placing an order." />; }
