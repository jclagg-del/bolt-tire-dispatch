import{NextResponse}from"next/server";
import{createAdminClient}from"@/lib/supabase/admin";
import{fallbackBusinessSettings}from"@/lib/business-settings";
export async function GET(){const{data}=await createAdminClient().from("business_settings").select("*").eq("id",true).maybeSingle();const s={...fallbackBusinessSettings,...(data||{})};return NextResponse.json({passenger:{two:s.passenger_two_install,four:s.passenger_four_install},truck:{two:s.truck_two_install,four:s.truck_four_install,six:s.truck_six_install},disposal:{passenger:s.passenger_disposal_fee,truck:s.truck_disposal_fee},stateFee:s.ny_state_tire_fee,taxRate:s.default_sales_tax_rate})}
