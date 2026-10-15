import {paymentWebhook} from '../../../../lib/payment-webhook';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return paymentWebhook(request,true);}
