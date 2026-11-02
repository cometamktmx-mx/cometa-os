// Preserve the existing deployed production guard. Local verification uses only
// loopback services and never substitutes a test backend into a Vercel release.
if (process.env.VERCEL_ENV !== undefined || process.env.VERCEL === '1') {
  if (process.env.VERCEL_ENV !== 'production' ||
      process.env.STOREFRONT_SUPABASE_URL !== 'https://zhtagqrzyovsrmsicaot.supabase.co' ||
      process.env.STOREFRONT_PAYMENTS_MODE !== 'live') {
    throw Error('CONFIRMED_PRODUCTION_TARGET_REQUIRED');
  }
  console.log('Production backend and live-mode isolation verified');
} else {
  const url = new URL(process.env.STOREFRONT_SUPABASE_URL || 'http://invalid');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      process.env.STOREFRONT_PAYMENTS_MODE !== 'test') {
    throw Error('ISOLATED_LOCAL_BUILD_REQUIRED');
  }
  console.log('Isolated local build target verified');
}
