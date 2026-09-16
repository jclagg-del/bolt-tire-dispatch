import { NextRequest, NextResponse } from "next/server";
import { searchAtdBySize } from "@/lib/atd";
import { searchUsafBySize } from "@/lib/usaf-catalog";
import { enrichWithTireLibrary } from "@/lib/tire-library";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = String(request.nextUrl.searchParams.get("query") || "2756518").replace(/\D/g, "");
  if (query.length < 7 || query.length > 8) return NextResponse.json({ error: "Enter a valid tire size." }, { status: 400 });
  try {
    const [atd, usaf] = await Promise.all([searchAtdBySize(query, false), searchUsafBySize(query, false)]);
    const products = await enrichWithTireLibrary([...atd, ...usaf]);
    return NextResponse.json({
      query,
      supplierResults: { atd: atd.length, usaf: usaf.length },
      matched: products.filter((product) => Boolean((product as typeof product & { tireLibraryMatched?: boolean }).tireLibraryMatched)).length,
      withImages: products.filter((product) => Boolean(product.imageUrl)).length,
      products: products.slice(0, 100).map((product) => ({
        supplier: product.supplier,
        brand: product.brand,
        model: product.model,
        supplierProductNumber: product.atdProductNumber,
        manufacturerProductNumber: product.manufacturerProductNumber,
        tireLibraryMatched: Boolean((product as typeof product & { tireLibraryMatched?: boolean }).tireLibraryMatched),
        imageUrl: product.imageUrl || null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Diagnostic failed" }, { status: 500 });
  }
}
