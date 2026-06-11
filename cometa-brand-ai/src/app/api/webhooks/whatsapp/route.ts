import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "WhatsApp webhook placeholder activo",
  });
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    message: "WhatsApp webhook recibido",
  });
}