import { StoreInformation } from './store-information';
import { publicStore } from "./public-store";
import {AtelierStore as StoreHome} from './atelier-store';
import { emptyAppearance, parseAppearance } from "../../../packages/own-storefront/contract";
import { Checkout } from "../../../packages/own-storefront/checkout";
export async function CheckoutPage({ orderId = "", bagOnly = false }: { orderId?: string; bagOnly?: boolean }) {
  const store = publicStore();
  const result = store ? await store.client.rpc("store_brand_context_m6", { p_brand: store.slug }) : null;
  const data = result?.error ? null : result?.data;
  if (!data && !orderId) return <main><h1>Tienda no disponible</h1><p>No pudimos verificar esta tienda. Tu bolsa se conserva; vuelve a intentarlo más tarde.</p></main>;
  const appearance = data && store ? parseAppearance(data.appearance, store.slug) : { ...emptyAppearance(), name: "Tu tienda", entrance: false };
  return <StoreHome footerContent={<StoreInformation/>} appearance={appearance} products={[]} mediaBase={store?.mediaBase ?? ""}><Checkout presentation={appearance.bag} brandId={data?.brandId ?? ""} orderId={orderId} bagOnly={bagOnly} /></StoreHome>;
}
