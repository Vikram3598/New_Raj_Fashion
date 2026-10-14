export const PERMISSIONS = {
  PRODUCT_READ: "product.read",
  PRODUCT_WRITE: "product.write",
  PRODUCT_PUBLISH: "product.publish",
  INVENTORY_READ: "inventory.read",
  INVENTORY_ADJUST: "inventory.adjust",
  ORDER_READ: "order.read",
  ORDER_FULFIL: "order.fulfil",
  ORDER_REFUND: "order.refund",
  CUSTOMER_READ: "customer.read",
  STAFF_MANAGE: "staff.manage",
  SETTINGS_WRITE: "settings.write",
  REPORTS_READ: "reports.read",
  AUDIT_READ: "audit.read",
  PAYMENT_READ: "payment.read",
  STORE_VISIT_READ: "store_visit.read",
  STORE_VISIT_PREPARE: "store_visit.prepare",
  PICKUP_READ: "pickup.read",
  PICKUP_FULFIL: "pickup.fulfil",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const OWNER_PERMISSIONS = Object.values(PERMISSIONS);

export const DEFAULT_STAFF_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.PRODUCT_READ,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.ORDER_FULFIL,
  PERMISSIONS.STORE_VISIT_READ,
  PERMISSIONS.STORE_VISIT_PREPARE,
  PERMISSIONS.PICKUP_READ,
  PERMISSIONS.PICKUP_FULFIL,
];

export const FULFILMENT_TRANSITIONS: Record<string, string[]> = {
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLATION_REQUESTED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLATION_REQUESTED", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLATION_REQUESTED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  CANCELLATION_REQUESTED: ["CANCELLED", "PROCESSING"],
  CANCELLED: ["REFUND_PROCESSING"],
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"],
  RETURNED: ["REFUND_PROCESSING"],
  REFUND_PROCESSING: [],
  REFUNDED: [],
};

export function resolveAuthorization(input: {
  assignedRoles: string[];
  rolePermissions: { role: string; key: string }[];
  staffStatus: string | null;
  staffGrants: { key: string; granted: boolean }[];
}) {
  const staffActive = input.staffStatus === "ACTIVE";
  const roles = input.assignedRoles.filter((role) => role !== "STAFF" || staffActive);
  const permissionSet = new Set<string>();
  for (const permission of input.rolePermissions) {
    if (permission.role === "STAFF" && !staffActive) continue;
    permissionSet.add(permission.key);
  }
  if (roles.includes("OWNER")) {
    for (const permission of OWNER_PERMISSIONS) permissionSet.add(permission);
  }
  if (staffActive) {
    for (const grant of input.staffGrants) {
      if (grant.granted) permissionSet.add(grant.key);
      else permissionSet.delete(grant.key);
    }
  }
  return { roles, permissions: [...permissionSet] as PermissionKey[] };
}
