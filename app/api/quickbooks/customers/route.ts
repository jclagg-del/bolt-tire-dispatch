import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/supabase/admin";
import { escapeQueryValue, quickBooksRequest } from "@/lib/quickbooks";

export async function GET(request: Request) {
  try {
    if (!(await requireApiUser(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const search = new URL(request.url).searchParams.get("q")?.trim() || "";
    if (search.length < 2) return NextResponse.json({ customers: [] });
    const query = encodeURIComponent(
      `select * from Customer where DisplayName like '${escapeQueryValue(search)}%' maxresults 20`
    );
    const result = await quickBooksRequest(`/query?query=${query}`);
    const customers = (result.QueryResponse?.Customer || []).map((customer: Record<string, any>) => ({
      id: customer.Id,
      displayName: customer.DisplayName || "",
      email: customer.PrimaryEmailAddr?.Address || "",
      phone: customer.PrimaryPhone?.FreeFormNumber || "",
      address: [
        customer.BillAddr?.Line1,
        customer.BillAddr?.Line2,
        customer.BillAddr?.City,
        customer.BillAddr?.CountrySubDivisionCode,
        customer.BillAddr?.PostalCode,
      ].filter(Boolean).join(", "),
    }));
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json({ customers: [], error: error instanceof Error ? error.message : "Customer search failed." }, { status: 500 });
  }
}
