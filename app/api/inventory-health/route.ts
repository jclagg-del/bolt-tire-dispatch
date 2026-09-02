import { NextResponse } from "next/server";
import { createAdminClient, requireApiUser } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  if (!await requireApiUser(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const [latest, products, matched, review, reviewItems] = await Promise.all([
    admin.from("usaf_import_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("usaf_inventory").select("part_number", { count: "exact", head: true }),
    admin.from("inventory_match_audits").select("canonical_key", { count: "exact", head: true }).eq("status", "matched"),
    admin.from("inventory_match_audits").select("canonical_key", { count: "exact", head: true }).eq("status", "review"),
    admin.from("inventory_match_audits").select("canonical_key,tire_size,brand,model,confidence,reason,last_seen_at").eq("status", "review").order("last_seen_at", { ascending: false }).limit(20),
  ]);
  const lastImport = latest.data;
  const ageHours = lastImport?.completed_at ? (Date.now() - new Date(lastImport.completed_at).getTime()) / 3_600_000 : null;
  return NextResponse.json({
    healthy: lastImport?.status === "completed" && ageHours != null && ageHours < 6,
    stale: ageHours == null || ageHours >= 6,
    lastImport, productCount: products.count || 0, matchedCount: matched.count || 0,
    reviewCount: review.count || 0, reviewItems: reviewItems.data || [],
  });
}
