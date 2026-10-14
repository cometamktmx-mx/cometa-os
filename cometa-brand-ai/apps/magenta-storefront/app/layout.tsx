import "../../../packages/own-storefront/checkout.css";
import "../../../packages/own-storefront/product.css";
import "../../../packages/own-storefront/home.css";
import "../../../packages/own-storefront/catalog.css";
import { StoreInformation } from '../lib/store-information';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body style={{ margin: 0 }}>{children}<StoreInformation/></body></html>;
}
