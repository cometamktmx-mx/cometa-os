import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const commandCenter = read("src/app/brand/[brandSlug]/components/brand-command-center.tsx");
const onboarding = read("src/app/brand/[brandSlug]/comu/onboarding/onboarding-client.tsx");
const legacy = read("src/app/comu/seller/page.tsx");
const productChannel = read("src/app/brand/[brandSlug]/pos/products/comu-channel-status.tsx");
const sellerAdmin = read("src/app/brand/[brandSlug]/comu/page.tsx");

const checks = [
  ["active command center uses brand admin", commandCenter.includes('comuActive ? `${base}/comu`')],
  ["incomplete command center uses onboarding", commandCenter.includes("`${base}/comu/onboarding`")],
  ["onboarding admin action uses brand admin", onboarding.includes("/brand/${initial.brand.slug}/comu")],
  ["onboarding public action uses public seller", onboarding.includes("/comu/sellers/${slug}")],
  ["legacy route resolves authenticated actor", legacy.includes("requireComuActor")],
  ["legacy route redirects a single active seller", legacy.includes("/brand/${encodeURIComponent(brandSlug)}/comu")],
  ["canonical route renders seller admin", sellerAdmin.includes("SellerDashboard")],
  ["product channel links within brand context", productChannel.includes("/brand/${encodeURIComponent(brandSlug)}/comu")],
];

const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
if (failures.length) {
  console.error(`FAIL: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`PASS: ${checks.length} COMU seller navigation checks`);
