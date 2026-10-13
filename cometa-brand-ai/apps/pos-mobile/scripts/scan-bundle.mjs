import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function inspectContent(content, channel, secrets = []) {
  if (/(?:sk_(?:live|test)_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s]+|SUPABASE_SERVICE_ROLE|STRIPE_SECRET_KEY|COMETA_POS_KEYSTORE_PASSWORD)/.test(content)) throw Error('Private material detected');
  for (const secret of secrets) if (secret.length >= 8 && content.includes(secret)) throw Error('Private environment value detected');
  for (const m of content.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    let claims; try { claims = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { throw Error('Unrecognized JWT'); }
    if (claims.role !== 'anon') throw Error('Non-public JWT');
  }
  if (channel === 'beta' && /(?:zhtagqrzyovsrmsicaot\.supabase\.co|https?:\/\/(?:app\.|www\.)?cometaos\.com(?:[/:"']|$)|cometa-os(?:-[a-z0-9-]+)?\.vercel\.app|https?:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?:[:/]|$))/.test(content)) throw Error('Forbidden Beta endpoint');
}
export function scan(directory, channel) {
  let count = 0;
  const secrets = Object.entries(process.env).filter(([k]) => /(?:PASSWORD|SECRET|PRIVATE|SERVICE_ROLE|ACCESS_TOKEN|API_KEY)/.test(k) && !k.startsWith('VITE_')).map(([,v]) => v || '');
  function walk(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) { walk(file); continue; }
    if (/(?:^\.env|\.(?:jks|keystore|p12|pfx|pem)$)/i.test(e.name)) throw Error('Private file detected');
    inspectContent(readFileSync(file).toString('utf8'), channel, secrets); count++;
  } }
  walk(directory); return count;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const channel = process.argv[2];
  if (!['development','beta'].includes(channel)) throw Error('Explicit scan channel required');
  console.log(`PASS: ${scan('dist', channel)} bundle files scanned (${channel}); no matched private material`);
}
