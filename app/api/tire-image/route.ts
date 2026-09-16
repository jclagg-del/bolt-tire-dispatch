import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedHosts = [
  "tireweb.tirelibrary.com",
  "images.atdonline.com",
];

function allowedImage(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const source = String(request.nextUrl.searchParams.get("url") || "");
  if (!allowedImage(source)) return NextResponse.json({ error: "Unsupported tire image host" }, { status: 400 });

  try {
    const response = await fetch(source, {
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
