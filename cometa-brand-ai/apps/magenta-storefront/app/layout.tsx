
import './atelier/magenta.css';
import './atelier/atelier.css';
import './atelier/commerce.css';
import './atelier/atelier-v4.css';
import './atelier/product-v5.css';
import './atelier/product-v6.css';
import "../../../packages/own-storefront/checkout.css";
import "../../../packages/own-storefront/product.css";
import "../../../packages/own-storefront/home.css";
import "../../../packages/own-storefront/catalog.css";
import './atelier-adapter.css';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body style={{ margin: 0 }}>{children}</body></html>;
}
