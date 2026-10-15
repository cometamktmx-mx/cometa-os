import ImportPage from './importer';
export default function Page() {
  const showTestHelp = process.env.VERCEL_ENV === 'preview' && process.env.STOREFRONT_PAYMENTS_MODE === 'test';
  return <ImportPage showTestHelp={showTestHelp} />;
}
