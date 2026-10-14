import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const assets = [
  ["mens-formal.svg", "#15243c", "#506782", "shirt", "Men’s formal shirt"],
  ["mens-kurta.svg", "#bd7c27", "#f1d6a3", "kurta", "Men’s festive kurta"],
  ["womens-ethnic.svg", "#9c365e", "#efb4c1", "dress", "Women’s ethnic wear"],
  ["silk-saree.svg", "#57285f", "#d3a24b", "saree", "Silk saree"],
  ["bridal-saree.svg", "#a51e35", "#f1c95a", "saree", "Bridal saree"],
  ["lehenga.svg", "#a22558", "#f3b44b", "lehenga", "Bridal lehenga"],
  ["sherwani.svg", "#d7c09a", "#7b293b", "sherwani", "Groom sherwani"],
  ["kidswear.svg", "#168681", "#e5c44d", "kids", "Kids festive wear"],
  ["suiting.svg", "#285267", "#b49a75", "fabric", "Suiting and shirting fabric"],
  ["festive.svg", "#1d6b61", "#e0ad48", "kurta", "Festive ethnic wear"],
  ["accessories.svg", "#78503a", "#d9b15e", "accessory", "Fashion accessories"],
  ["banner-wedding.svg", "#531e37", "#e5bc74", "banner", "Wedding collection"],
  ["banner-sidhee.svg", "#164e58", "#e6b955", "banner", "Festive collection"],
  ["fallback.svg", "#f0e7d8", "#8d2734", "fallback", "Sample fashion illustration"],
];

function silhouette(type, accent) {
  const common = `fill="url(#cloth)" stroke="${accent}" stroke-width="9" stroke-linejoin="round"`;
  if (type === "shirt" || type === "kids") return `<path ${common} d="M315 245 390 205h80l75 40 74 118-76 51-35-56v385H292V358l-35 56-76-51z"/><path d="m390 205 40 58 40-58m-40 58v480" fill="none" stroke="#fff6e8" stroke-width="13" opacity=".9"/><path d="M383 330h12m-12 55h12m-12 55h12" stroke="#fff6e8" stroke-width="12" stroke-linecap="round"/>`;
  if (type === "kurta" || type === "sherwani") return `<path ${common} d="M345 220 400 190h80l55 30 66 120-70 45-35-52v413H304V333l-35 52-70-45z"/><path d="M400 193v603m0-470 24 28 24-28m-48 86h26m-26 54h26m-26 54h26m-26 54h26" fill="none" stroke="#fff3dc" stroke-width="12" stroke-linecap="round" opacity=".92"/>`;
  if (type === "saree") return `<path ${common} d="M305 230h200l58 150-85 72 125 334H265l74-345-93-62z"/><path d="M310 244h183m-206 135 257 287m-278-240 334 351" fill="none" stroke="#ffe8a8" stroke-width="16" opacity=".88"/><path d="M252 416c120 65 245 76 348 6" fill="none" stroke="${accent}" stroke-width="11"/>`;
  if (type === "lehenga") return `<path ${common} d="M355 220 400 195h80l45 25 48 100-65 48-30-43v84c76 15 140 59 177 127L740 800H220l85-264c38-68 103-112 178-127v-84l-30 43-65-48z"/><path d="M295 580c126 74 248 74 410 0M270 664c150 76 285 76 460 0M240 750c180 70 350 70 510 0" fill="none" stroke="#ffe6a5" stroke-width="13" opacity=".9"/>`;
  if (type === "dress") return `<path ${common} d="M360 205h150l37 83-42 79c-2 40 15 89 53 151l110 277H230l110-277c38-62 55-111 53-151l-42-79z"/><path d="M340 500c92 52 196 52 290 0m-330 94c120 52 248 52 370 0m-410 92c150 50 302 50 450 0" fill="none" stroke="#fff1d7" stroke-width="12" opacity=".8"/>`;
  if (type === "fabric") return `<g ${common}><rect x="210" y="265" width="380" height="425" rx="40"/><path d="M210 362h380M210 470h380M210 578h380" stroke="#fff4dd" stroke-width="11" opacity=".8"/><ellipse cx="590" cy="330" rx="85" ry="65" fill="#efe1c9" stroke="${accent}" stroke-width="11"/><ellipse cx="590" cy="438" rx="85" ry="65" fill="#e5d4b6" stroke="${accent}" stroke-width="11"/><ellipse cx="590" cy="546" rx="85" ry="65" fill="#f1e5ce" stroke="${accent}" stroke-width="11"/></g>`;
  if (type === "accessory") return `<path ${common} d="M260 355h300l48 360H212z"/><path d="M325 354c0-125 170-125 170 0" fill="none" stroke="#f8e5b7" stroke-width="20"/><circle cx="660" cy="330" r="65" fill="none" stroke="#f3d477" stroke-width="18"/><circle cx="660" cy="330" r="22" fill="#f3d477"/><path d="M640 403c0 108 42 108 42 180 0 57-41 64-41 126" fill="none" stroke="#f3d477" stroke-width="16"/>`;
  if (type === "banner") return `<path ${common} d="M230 300h120l62-62 62 62h120l-30 330c-16 180-121 255-152 255s-136-75-152-255z"/><path d="M250 620c91 46 225 46 325 0m-298 85c80 36 195 36 271 0m-236 82c52 24 135 24 187 0" fill="none" stroke="#ffe9bb" stroke-width="16" opacity=".9"/>`;
  return `<path d="M270 660 400 350l130 310" fill="none" stroke="${accent}" stroke-width="38" stroke-linecap="round"/><circle cx="400" cy="300" r="100" fill="none" stroke="${accent}" stroke-width="20"/>`;
}

function svg([, base, accent, type, title]) {
  const wide = type === "banner";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wide ? 1600 : 800} 1000" role="img" aria-label="${title} — sample illustration only">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient><linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient><pattern id="motif" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M40 8c28 18 28 46 0 64C12 54 12 26 40 8z" fill="none" stroke="#fff3d2" stroke-opacity=".14" stroke-width="3"/><circle cx="40" cy="40" r="5" fill="#fff3d2" fill-opacity=".2"/></pattern><filter id="shadow" x="-.3" y="-.2" width="1.6" height="1.6"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-color="#120b13" flood-opacity=".35"/></filter></defs>
<rect width="100%" height="100%" fill="url(#bg)"/><rect width="100%" height="100%" fill="url(#motif)"/><circle cx="${wide ? 1320 : 650}" cy="150" r="210" fill="#fff3d2" fill-opacity=".12"/><circle cx="${wide ? 150 : 95}" cy="870" r="260" fill="#180e18" fill-opacity=".1"/><rect x="42" y="42" width="${wide ? 1516 : 716}" height="916" rx="40" fill="none" stroke="#fff3d2" stroke-opacity=".38" stroke-width="3"/>
<g transform="${wide ? "translate(390 0) scale(.8)" : ""}" filter="url(#shadow)">${silhouette(type, accent)}</g>
<path d="M70 875h${wide ? 1460 : 660}" stroke="#fff3d2" stroke-opacity=".4" stroke-width="2"/><text x="${wide ? 130 : 80}" y="925" fill="#fff8e8" font-family="Arial,sans-serif" font-size="26" letter-spacing="5">SAMPLE ARTWORK · NOT ACTUAL STOCK</text></svg>`;
}

const output = join(process.cwd(), "public", "images", "demo");
await mkdir(output, { recursive: true });
for (const asset of assets) await writeFile(join(output, asset[0]), svg(asset), "utf8");
console.info(`Generated ${assets.length} local sample fashion illustrations in public/images/demo.`);
