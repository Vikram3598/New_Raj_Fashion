import { PrismaClient, RoleName } from "@prisma/client";
import { PERMISSIONS, DEFAULT_STAFF_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();
const permissionDescriptions: Record<string, string> = {
  "product.read": "View catalogue data", "product.write": "Create and edit product data", "product.publish": "Publish products",
  "inventory.read": "View stock", "inventory.adjust": "Adjust stock", "order.read": "View operational orders",
  "order.fulfil": "Update fulfilment", "order.refund": "Initiate refunds", "customer.read": "View limited customer data",
  "staff.manage": "Manage staff", "settings.write": "Manage settings", "reports.read": "View reports",
  "audit.read": "View audit records", "payment.read": "View payment information",
};
const categories = ["Men's Wear", "Women's Wear", "Sarees", "Kids' Wear", "Suiting and Shirting", "Wedding Collection", "Festive and Traditional Wear", "Accessories"];
const subcategories: Record<string, string[]> = {
  "Men's Wear": ["Shirts", "T-shirts", "Trousers", "Jeans", "Kurtas", "Jackets", "Suits", "Ethnic Wear"],
  "Women's Wear": ["Kurtis", "Dresses", "Tops", "Leggings", "Suits", "Gowns", "Ethnic Wear"],
  Sarees: ["Silk Sarees", "Banarasi Sarees", "Wedding Sarees", "Designer Sarees", "Party Wear Sarees", "Cotton Sarees", "Traditional Sarees"],
  "Kids' Wear": ["Boys' Clothing", "Girls' Clothing", "Newborn Clothing", "Children's Ethnic Wear"],
  "Suiting and Shirting": ["Suit Fabrics", "Shirting Fabrics", "Trouser Fabrics", "Formal Wear Materials"],
  "Wedding Collection": ["Bridal Wear", "Groom Wear", "Lehengas", "Sherwanis", "Family Occasion Wear", "Reception Wear"],
  "Festive and Traditional Wear": ["Festive Wear", "Traditional Wear"],
  Accessories: ["Fashion Accessories", "Other Fashion Products"],
};
const homeSections = [
  ["new-arrivals", "New arrivals"], ["sarees", "Featured sarees"], ["mens-formal", "Men's formal wear"],
  ["womens-ethnic", "Women's ethnic wear"], ["kids", "Kids' collection"], ["suiting", "Suiting and shirting"], ["wedding", "Wedding collection"],
] as const;
async function main() {
  const permissions = await Promise.all(Object.values(PERMISSIONS).map((key) => prisma.permission.upsert({
    where: { key }, update: { description: permissionDescriptions[key] ?? key }, create: { key, description: permissionDescriptions[key] ?? key },
  })));
  const descriptions: Record<RoleName, string> = { CUSTOMER: "Store customer", STAFF: "Authorized store staff", OWNER: "Store owner" };
  for (const name of Object.values(RoleName)) {
    const role = await prisma.role.upsert({ where: { name }, update: { description: descriptions[name] }, create: { name, description: descriptions[name] } });
    const allowed = name === "OWNER" ? permissions.map((p) => p.key) : name === "STAFF" ? DEFAULT_STAFF_PERMISSIONS : [];
    for (const key of allowed) {
      const permission = permissions.find((p) => p.key === key);
      if (permission) await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: {}, create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  const categoryIds = new Map<string, string>();
  for (const [sortOrder, name] of categories.entries()) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const category = await prisma.category.upsert({ where: { slug }, update: { name, sortOrder, published: true }, create: { name, slug, sortOrder, published: true } });
    categoryIds.set(name, category.id);
  }
  for (const [parentName, children] of Object.entries(subcategories)) {
    const parentId = categoryIds.get(parentName);
    if (!parentId) continue;
    const parentSlug = parentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    for (const [sortOrder, name] of children.entries()) {
      const childSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slug = `${parentSlug}-${childSlug}`;
      await prisma.category.upsert({ where: { slug }, update: { name, parentId, sortOrder, published: true }, create: { name, slug, parentId, sortOrder, published: true } });
    }
  }
  for (const [sortOrder, [key, title]] of homeSections.entries()) await prisma.homeSection.upsert({ where: { key }, update: {}, create: { key, title, sortOrder, enabled: true } });
  await prisma.collection.upsert({ where: { slug: "wedding" }, update: {}, create: { name: "Wedding Collection", slug: "wedding", sortOrder: 0, published: true } });
  await prisma.storeSettings.upsert({ where: { id: "store" }, update: {}, create: {
    id: "store", storeName: "New Raj Fashion and Raj Saree Showroom", address: "Gandhi Chowk", city: "Sidhi", state: "Madhya Pradesh", postalCode: "486661",
    phone: null, email: null, gstin: null, currency: "INR", timezone: "Asia/Kolkata", paymentConfig: { codEnabled: false },
  } });
  console.info("Seeded roles, permissions, category taxonomy, home sections, wedding collection and store address. No demo customers, products, stock, prices or Owner account were created.");
}
main().catch((error) => { console.error("Database seed failed.", error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
