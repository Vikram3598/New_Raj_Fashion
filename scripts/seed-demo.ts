import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const products = [
  { sku: "DEMO-MENS-FORMAL-01", slug: "demo-mens-formal-shirt", name: "Midnight Tailored Formal Shirt", nameHi: "मिडनाइट फ़ॉर्मल शर्ट", category: "men-s-wear-shirts", price: 189900, mrp: 229900, size: "M", colour: "Midnight navy", fabric: "Cotton blend", image: "mens-formal.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-MENS-KURTA-01", slug: "demo-festive-kurta", name: "Marigold Festive Kurta", nameHi: "गेंदा उत्सवी कुर्ता", category: "men-s-wear-kurtas", price: 249900, mrp: 299900, size: "L", colour: "Marigold", fabric: "Cotton silk", image: "mens-kurta.svg", description: "Demonstration catalogue item. Not a verified live product photograph or inventory record.", descriptionHi: "डेमो कैटलॉग उत्पाद। यह वास्तविक उत्पाद फ़ोटो या स्टॉक रिकॉर्ड नहीं है।" },
  { sku: "DEMO-WOMENS-ETHNIC-01", slug: "demo-rose-ethnic-set", name: "Rose Garden Ethnic Set", nameHi: "रोज़ गार्डन एथनिक सेट", category: "women-s-wear-kurtis", price: 329900, mrp: 389900, size: "M", colour: "Rose pink", fabric: "Rayon blend", image: "womens-ethnic.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-SAREE-SILK-01", slug: "demo-purple-silk-saree", name: "Royal Plum Silk Saree", nameHi: "रॉयल प्लम सिल्क साड़ी", category: "sarees-silk-sarees", price: 549900, mrp: 649900, size: "Free size", colour: "Plum and antique gold", fabric: "Silk blend", image: "silk-saree.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-SAREE-BRIDAL-01", slug: "demo-crimson-bridal-saree", name: "Crimson Wedding Saree", nameHi: "क्रिमसन शादी की साड़ी", category: "sarees-wedding-sarees", price: 1199900, mrp: 1399900, size: "Free size", colour: "Crimson and gold", fabric: "Silk blend", image: "bridal-saree.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-BRIDAL-LEHENGA-01", slug: "demo-fuchsia-bridal-lehenga", name: "Fuchsia Celebration Lehenga", nameHi: "फ़्यूशिया उत्सव लहंगा", category: "wedding-collection-bridal-wear", price: 1599900, mrp: 1899900, size: "M", colour: "Fuchsia", fabric: "Embroidered georgette", image: "lehenga.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-GROOM-SHERWANI-01", slug: "demo-ivory-groom-sherwani", name: "Ivory Heritage Sherwani", nameHi: "आइवरी हेरिटेज शेरवानी", category: "wedding-collection-groom-wear", price: 1299900, mrp: 1499900, size: "L", colour: "Ivory and wine", fabric: "Jacquard blend", image: "sherwani.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-KIDS-ETHNIC-01", slug: "demo-kids-festive-set", name: "Little Celebration Festive Set", nameHi: "नन्हा उत्सव फ़ेस्टिव सेट", category: "kids-wear-boys-clothing", price: 149900, mrp: 179900, size: "4Y", colour: "Teal and saffron", fabric: "Cotton blend", image: "kidswear.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-SUITING-01", slug: "demo-indigo-suiting-fabric", name: "Indigo Classic Suiting Fabric", nameHi: "इंडिगो क्लासिक सूटिंग कपड़ा", category: "suiting-and-shirting-suit-fabrics", price: 89900, mrp: 109900, size: "3 metres", colour: "Indigo", fabric: "Poly-viscose blend", image: "suiting.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-FESTIVE-01", slug: "demo-teal-festive-kurta", name: "Peacock Teal Festive Kurta", nameHi: "मोरपंखी उत्सवी कुर्ता", category: "festive-and-traditional-wear-festive-wear", price: 219900, mrp: 269900, size: "XL", colour: "Peacock teal", fabric: "Cotton silk", image: "festive.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
  { sku: "DEMO-ACCESSORY-01", slug: "demo-occasion-accessory-set", name: "Golden Hour Occasion Accessory Set", nameHi: "गोल्डन आवर अवसर एक्सेसरी सेट", category: "accessories-fashion-accessories", price: 79900, mrp: 99900, size: "One size", colour: "Antique gold", fabric: "Fashion jewellery", image: "accessories.svg", description: "Demonstration catalogue item. Sample styling, price and stock only; confirm actual availability with the showroom.", descriptionHi: "डेमो कैटलॉग उत्पाद। नमूना स्टाइल, कीमत और स्टॉक; वास्तविक उपलब्धता शोरूम से जाँचें।" },
];

async function main() {
  const categoryRows = await prisma.category.findMany({ where: { slug: { in: [...new Set(products.map((product) => product.category))] } }, select: { id: true, slug: true } });
  const categories = new Map(categoryRows.map((category) => [category.slug, category.id]));
  const missing = [...new Set(products.map((product) => product.category))].filter((slug) => !categories.has(slug));
  if (missing.length) throw new Error(`Run npm run db:seed first. Missing category slugs: ${missing.join(", ")}`);

  for (const [index, sample] of products.entries()) {
    const categoryId = categories.get(sample.category)!;
    const product = await prisma.product.upsert({
      where: { sku: sample.sku },
      update: { name: sample.name, nameHi: sample.nameHi, description: sample.description, descriptionHi: sample.descriptionHi, categoryId, status: "PUBLISHED", tags: ["demo", "sample", "review-before-launch"] },
      create: { sku: sample.sku, slug: sample.slug, name: sample.name, nameHi: sample.nameHi, description: sample.description, descriptionHi: sample.descriptionHi, categoryId, status: "PUBLISHED", tags: ["demo", "sample", "review-before-launch"], fabric: sample.fabric, material: sample.fabric, gender: "UNISEX", occasion: "Demonstration", images: { create: { url: `/images/demo/${sample.image}`, alt: `${sample.name} — sample illustration only`, altHi: `${sample.nameHi} — केवल नमूना चित्र`, sortOrder: 0 } } },
    });
    const existingImage = await prisma.productImage.findFirst({ where: { productId: product.id, url: `/images/demo/${sample.image}` } });
    if (existingImage) await prisma.productImage.update({ where: { id: existingImage.id }, data: { alt: `${sample.name} — sample illustration only`, altHi: `${sample.nameHi} — केवल नमूना चित्र`, sortOrder: 0 } });
    else await prisma.productImage.create({ data: { productId: product.id, url: `/images/demo/${sample.image}`, alt: `${sample.name} — sample illustration only`, altHi: `${sample.nameHi} — केवल नमूना चित्र`, sortOrder: 0 } });
    const variantSku = `${sample.sku}-ONE`;
    const variant = await prisma.productVariant.upsert({
      where: { sku: variantSku },
      update: { title: `${sample.size} · ${sample.colour}`, size: sample.size, colour: sample.colour, pricePaise: sample.price, mrpPaise: sample.mrp, isActive: true },
      create: { productId: product.id, sku: variantSku, title: `${sample.size} · ${sample.colour}`, size: sample.size, colour: sample.colour, pricePaise: sample.price, mrpPaise: sample.mrp, stockOnHand: 5, isActive: true },
    });
    const openingMovement = await prisma.inventoryMovement.findFirst({ where: { variantId: variant.id, reason: "demo_initial_stock", reference: `demo-seed:${sample.sku}` } });
    if (!openingMovement && variant.stockOnHand > 0) await prisma.inventoryMovement.create({ data: { variantId: variant.id, deltaOnHand: variant.stockOnHand, reason: "demo_initial_stock", reference: `demo-seed:${sample.sku}` } });
    if (sample.category.startsWith("wedding-collection")) {
      const collection = await prisma.collection.findUnique({ where: { slug: "wedding" }, select: { id: true } });
      if (collection) await prisma.collectionProduct.upsert({ where: { collectionId_productId: { collectionId: collection.id, productId: product.id } }, update: {}, create: { collectionId: collection.id, productId: product.id } });
    }
    console.info(`Seeded demo sample ${index + 1}/${products.length}: ${sample.sku}`);
  }

  for (const [sortOrder, title, imageUrl, slot] of [[0, "[DEMO] Wedding collection", "/images/demo/banner-wedding.svg", "hero"], [1, "[DEMO] Sidhi festive edit", "/images/demo/banner-sidhee.svg", "home-promo"]] as const) {
    const existing = await prisma.promotionBanner.findFirst({ where: { title } });
    const data = { title, subtitle: "Illustrative artwork and sample catalogue only", imageUrl, href: "/collections/wedding", slot, sortOrder, enabled: true };
    if (existing) await prisma.promotionBanner.update({ where: { id: existing.id }, data });
    else await prisma.promotionBanner.create({ data });
  }
  console.info("Demo fashion catalogue seeded. All product SKUs begin DEMO-; prices, images and stock are samples that must be reviewed before launch.");
}

main().catch((error) => { console.error("Demo catalogue seed failed.", error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
