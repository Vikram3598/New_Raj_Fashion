import { PolicyPage } from "@/components/storefront/policy-page";
export const metadata = { title: "Returns and refunds" };
export default function ReturnRefundPolicyPage() { return <PolicyPage title="Returns and refunds" setting="policyReturns" fallback="The store return and refund policy has not been configured yet. Please contact the showroom before placing an order." />; }
