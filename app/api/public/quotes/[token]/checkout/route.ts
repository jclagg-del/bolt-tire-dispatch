import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  const key=process.env.STRIPE_SECRET_KEY;
  const publishableKey=process.env.STRIPE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if(!key||!publishableKey)return NextResponse.json({error:"Stripe embedded checkout is not connected yet"},{status:503});
  const{token}=await params;
  const{optionId,purchase}=await request.json();
  const admin=createAdminClient();
  const{data:q}=await admin.from("quotes").select("*,quote_options!quote_options_quote_id_fkey(*)").eq("public_token",token).single();
  if(!q)return NextResponse.json({error:"Quote not found"},{status:404});
  if(q.payment_status==="paid")return NextResponse.json({error:"This order is already paid"},{status:409});
  const o=(q.quote_options||[]).find((x:{id:string})=>x.id===optionId);
  if(!o)return NextResponse.json({error:"Choose a valid tire option"},{status:400});

  const taxable=Number(o.price_per_tire)*Number(q.quantity)+Number(q.installation_cost)+Number(q.service_call_fee)+Number(q.disposal_fee);
  const stateFee=Number(q.ny_state_tire_fee);
  const origin=new URL(request.url).origin;
  const body=new URLSearchParams();
  body.set("mode","payment");
  body.set("ui_mode","embedded");
  body.set("return_url",`${origin}/q/${token}?${purchase?"purchase=1&":""}payment=success&session_id={CHECKOUT_SESSION_ID}`);
  body.set("redirect_on_completion","if_required");
  body.set("client_reference_id",q.id);
  body.set("metadata[quote_id]",q.id);
  body.set("metadata[quote_number]",String(q.quote_number));
  body.set("metadata[option_id]",o.id);
  body.set("payment_intent_data[metadata][quote_id]",q.id);
  body.set("line_items[0][quantity]","1");
  body.set("line_items[0][price_data][currency]","usd");
  body.set("line_items[0][price_data][unit_amount]",String(Math.round(taxable*100)));
  body.set("line_items[0][price_data][tax_behavior]","exclusive");
  body.set("line_items[0][price_data][product_data][tax_code]","txcd_99999999");
  body.set("line_items[0][price_data][product_data][name]",`Bolt Tire Order #${q.quote_number}`);
  body.set("line_items[0][price_data][product_data][description]",`${q.quantity} × ${o.brand} ${o.model} — installed`);
  if(stateFee>0){
    body.set("line_items[1][quantity]","1");
    body.set("line_items[1][price_data][currency]","usd");
    body.set("line_items[1][price_data][unit_amount]",String(Math.round(stateFee*100)));
    body.set("line_items[1][price_data][tax_behavior]","exclusive");
    body.set("line_items[1][price_data][product_data][tax_code]","txcd_00000000");
    body.set("line_items[1][price_data][product_data][name]","New York State tire fee");
  }
  if(!q.tax_exempt){body.set("automatic_tax[enabled]","true");body.set("billing_address_collection","required");body.set("customer_creation","always")}
  if(q.email)body.set("customer_email",q.email);

  const stripe=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  const session=await stripe.json();
  if(!stripe.ok)return NextResponse.json({error:session.error?.message||"Could not start payment"},{status:502});
  await admin.from("quotes").update({selected_option_id:o.id,status:"approved",payment_status:"pending",stripe_checkout_session_id:session.id,stripe_sales_tax_amount:null,updated_at:new Date().toISOString()}).eq("id",q.id);
  return NextResponse.json({clientSecret:session.client_secret,publishableKey});
}
