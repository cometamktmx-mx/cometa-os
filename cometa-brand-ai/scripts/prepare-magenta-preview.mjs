// Creates a new, secret-free deployment source snapshot. Never deploys or changes Git.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const destination = path.join(root, '.next', 'magenta-preview-preparation', 'source-' + Date.now());
const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const extensions = /\.(tsx?|jsx?|mjs|cjs|css|json|svg|png|jpe?g|webp|ico|woff2?)$/i;
const forbidden = /(^|\/)(\.env[^/]*|\.git|\.next|node_modules|\.vercel|backups?|fixtures?|sessions?)(\/|$)|\.(pem|key|p12|sql|apk|zip|log)$/i;
const shared = ['package.json', 'package-lock.json'];
const adminConfig = ['tsconfig.json', 'next.config.ts', 'postcss.config.mjs'];
const adminTarget = 'cometa-os/cometa-brand-ai'; // Existing Vercel project rootDirectory; do not change it remotely.
const runtimeExtras = ['config/pos-environments.json', 'apps/pos-mobile/config/download-origins.json', 'apps/pos-mobile/src/updates.ts', 'public/logo.png', 'public/manifest.json', 'public/sw.js'];
const manifest = [];
function copy(file, target) {
  if (forbidden.test(file) || file.startsWith('../') || !extensions.test(file)) throw Error('Disallowed deployment file: ' + file);
  const bytes = fs.readFileSync(path.join(root, file));
  if (/\.(tsx?|jsx?|mjs|cjs|json)$/i.test(file) && /(?:sk_live_|sk_test_|sb_secret_)[a-zA-Z0-9]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(bytes.toString())) throw Error('Possible embedded credential: ' + file);
  const dest = path.join(destination, target, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes, { flag: 'wx' });
  manifest.push({ target, file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
}
for (const file of [...new Set(tracked)]) {
  if (forbidden.test(file) || !extensions.test(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  if (shared.includes(file) || file.startsWith('apps/magenta-storefront/') || file.startsWith('packages/own-storefront/') || file === 'src/lib/pos/product-web-contract.ts') copy(file, 'storefront');
  // Full source dependencies for the existing admin, excluding local/dev surfaces and data.
  if (shared.includes(file) || adminConfig.includes(file) || runtimeExtras.includes(file) || (file.startsWith('src/') && !file.startsWith('src/app/dev/')) || file.startsWith('packages/own-storefront/') || file.startsWith('public/comu/') || file.startsWith('public/brand/')) copy(file, adminTarget);
}
for (const target of ['storefront', adminTarget]) {
  fs.writeFileSync(path.join(destination, target, '.vercelignore'), '.env*\n**/.env*\nnode_modules\n**/node_modules\n.next\n**/.next\n.git\n');
  const existing = target === adminTarget && process.argv.includes('--release') ? JSON.parse(fs.readFileSync('vercel.json','utf8')) : {};
  fs.writeFileSync(path.join(destination, target, 'vercel.json'), JSON.stringify({ ...existing, framework: 'nextjs', ...(target === 'storefront' ? { installCommand: 'npm ci --prefix ../..' } : {}), redirects: [...(existing.redirects || []), { source: '/_next/image', destination: '/image-service-disabled', statusCode: 307 }], headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }] }, null, 2));
}
// Root-directory storefront deployment uses its own config; no source files are changed.
fs.copyFileSync(path.join(destination, 'storefront/vercel.json'), path.join(destination, 'storefront/apps/magenta-storefront/vercel.json'));
fs.copyFileSync(path.join(destination, adminTarget, '.vercelignore'), path.join(destination, 'cometa-os/.vercelignore'));
fs.writeFileSync(path.join(destination, 'targets.json'), JSON.stringify({ admin: { project: 'cometa-os', scope: 'cometa-os-s-projects', source: 'cometa-os', rootDirectory: 'cometa-brand-ai', branch: 'feature/comu-v1', environment: 'preview' }, storefront: { project: 'magenta-controlled-preview', scope: 'cometa-os-s-projects', source: 'storefront', rootDirectory: 'apps/magenta-storefront', environment: 'preview' }, deployed: false, schemaApprovalRequired: true }, null, 2));
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ createdAt: new Date().toISOString(), status: 'SOURCE_ONLY_NOT_DEPLOYED', manifest }, null, 2));
console.log(JSON.stringify({ destination, files: manifest.length, bytes: manifest.reduce((sum, item) => sum + item.bytes, 0), note: 'No environment files, secrets or Git link copied. --release preserves only the existing admin cron; no new worker is configured.' }));
