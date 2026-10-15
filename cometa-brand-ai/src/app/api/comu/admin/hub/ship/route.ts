import { NextResponse } from "next/server";
import { shipShipment } from "@/lib/comu/fulfillment";
import { PosApiError } from "@/lib/pos/server";
export async function POST(request: Request){try{const body=await request.json() as {orderId?:string};if(!body.orderId)throw new PosApiError(400,"COMU_ORDER_REQUIRED","Indica la orden.");return NextResponse.json({ok:true,shipment:await shipShipment(body.orderId)})}catch(error){if(error instanceof PosApiError)return NextResponse.json({ok:false,code:error.code,message:error.message},{status:error.status});return NextResponse.json({ok:false,code:"COMU_SHIPMENT_FAILED",message:"No se pudo marcar el envío."},{status:409})}}
