import { NextRequest, NextResponse } from "next/server";
import { allowedTireImage } from "@/lib/tire-image-health";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const source = String(request.nextUrl.searchParams.get("url") || "");
  if (!allowedTireImage(source)) return NextResponse.json({ error: "Unsupported tire image host" }, { status: 400 });

  try {
    const response = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "Bolt Tire product catalog",
      },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().startsWith("image/")) {
      return NextResponse.json({ error: "Tire image is unavailable" }, { status: 502 });
    }
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    });
  } catch {
    return NextResponse.json({ error: "Tire image could not be loaded" }, { status: 502 });
  }
}
