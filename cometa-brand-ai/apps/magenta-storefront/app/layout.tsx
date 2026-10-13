import "../../../packages/own-storefront/checkout.css";
import "../../../packages/own-storefront/product.css";
import "../../../packages/own-storefront/home.css";
import "../../../packages/own-storefront/catalog.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body style={{ margin: 0 }}>{children}</body></html>;
}
