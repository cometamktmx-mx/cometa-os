import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const pieceId =
      searchParams.get("pieceId") ||
      searchParams.get("contentPieceId") ||
      searchParams.get("content_piece_id");

    if (!pieceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing pieceId",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("mercury_piece_comments")
      .select("*")
      .eq("content_piece_id", pieceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading piece comments:", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      comments: data ?? [],
    });
  } catch (error) {
    console.error("Unexpected error loading piece comments:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error loading piece comments",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const pieceId =
      body.pieceId ||
      body.contentPieceId ||
      body.content_piece_id;

    const commentText =
      body.commentText ||
      body.comment_text ||
      body.comment ||
      body.text;

    if (!pieceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing pieceId",
        },
        { status: 400 }
      );
    }

    if (!commentText || !String(commentText).trim()) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing comment text",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("mercury_piece_comments")
      .insert({
        content_piece_id: pieceId,
        comment_text: String(commentText).trim(),
        author_name: body.authorName || body.author_name || "Cometa",
        author_role: body.authorRole || body.author_role || "Equipo interno",
        source: body.source || "manual",
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating piece comment:", error);

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      comment: data,
    });
  } catch (error) {
    console.error("Unexpected error creating piece comment:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error creating piece comment",
      },
      { status: 500 }
    );
  }
}