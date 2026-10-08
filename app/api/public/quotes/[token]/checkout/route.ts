import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {shopCustomerError} from "@/lib/shop-customer";
import {lookupDiscount} from "@/lib/discounts-server";
import {quoteCheckoutDetails,quoteCheckoutDetailsError} from "@/lib/quote-checkout-details";
import { AdditionalItem, additionalItemAmount, additionalItemsError } from "@/lib/additional-items";
import { quotePaymentPrice } from "@/lib/quote-payment-pricing";

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  const key=process.env.STRIPE_SECRET_KEY;
  const publishableKey=process.env.STRIPE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if(!key||!publishableKey)return NextResponse.json({error:"Stripe embedded checkout is not connected yet"},{status:503});
  const{token}=await params;
  const{optionId,purchase,customerDetails}=await request.json();
  const admin=createAdminClient();
  const{data:q}=await admin.from("quotes").select("*,quote_options!quote_options_quote_id_fkey(*)").eq("public_token",token).single();
  if(!q)return NextResponse.json({error:"Quote not found"},{status:404});
  if(q.payment_status==="paid")return NextResponse.json({error:"This order is already paid"},{status:409});
  if(q.purchase_source==="website"){
    const customerError=shopCustomerError({...q,name:q.contact_name||q.customer});
    if(customerError)return NextResponse.json({error:`${customerError} Return to the tire shop to complete your information before payment.`},{status:400});
    if(q.discount_code_id){
      try{
        const discount=await lookupDiscount(q.discount_code_label);
        if(!discount||discount.id!==q.discount_code_id||Number(discount.percent)!==Number(q.discount_percent)||(discount.discount_type||"percent")!==(q.discount_type||"percent")||Number(discount.fixed_amount||0)!==Number(q.discount_fixed_amount||0)||discount.tax_exempt!==q.tax_exempt||discount.organization!==q.discount_organization)throw new Error("Discount settings changed. Return to checkout and apply the code again.");
      }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Discount approval could not be verified."},{status:409})}
    }
  }
  const o=(q.quote_options||[]).find((x:{id:string})=>x.id===optionId);
  if(!o)return NextResponse.json({error:"Choose a valid tire option"},{status:400});
  const extra: AdditionalItem[] = q.additional_items || [];
  const itemsError = additionalItemsError(extra);
  if(itemsError)return NextResponse.json({error:itemsError},{status:400});

  // Sent quotes must capture scheduling/contact details before a Stripe session
  // exists. Only these fields are customer-editable; prices and tax stay server-owned.
  if(q.purchase_source!=="website"){
    if(customerDetails!==undefined&&(!customerDetails||typeof customerDetails!=="object"||Array.isArray(customerDetails)))return NextResponse.json({error:"Complete your contact and service information."},{status:400});
    const details=quoteCheckoutDetails(customerDetails===undefined?q:customerDetails);
    const detailsError=quoteCheckoutDetailsError(details);
    if(detailsError)return NextResponse.json({error:detailsError},{status:400});
    const updates={...details,requested_time:details.requested_date===q.requested_date?q.requested_time||null:null,updated_at:new Date().toISOString()};
    let save=admin.from("quotes").update(updates).eq("id",q.id);
    save=q.payment_status==null?save.is("payment_status",null):save.eq("payment_status",q.payment_status);
    const saved=await save.select("id").maybeSingle();
    if(saved.error)return NextResponse.json({error:"Your information could not be saved. Please try again before paying."},{status:500});
    if(!saved.data)return NextResponse.json({error:"This quote changed in another window. Refresh before paying."},{status:409});
    Object.assign(q,updates);
  }

  if(q.payment_pricing_version===1){
    if(q.stripe_checkout_session_id)return NextResponse.json({error:"This quote already has a legacy payment session. Contact Bolt Tire."},{status:409});
    try {
      const regular=quotePaymentPrice(q,o,"regular"), discounted=quotePaymentPrice(q,o,"discounted");
      return NextResponse.json({paymentMode:"methods",publishableKey,optionId:o.id,regularCents:regular.subtotalCents,discountedCents:discounted.subtotalCents,serviceAddress:q.address});
    } catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Saved prices could not be verified."},{status:400})}
  }

  const taxable=Number(o.price_per_tire)*Number(q.quantity)+Number(o.rear_price_per_tire||0)*Number(q.rear_quantity||0)+Number(q.installation_cost)+Number(q.service_call_fee)+Number(q.disposal_fee);
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
  body.set("line_items[0][price_data][product_data][description]",[`${q.quantity} × ${o.brand} ${o.model}`,q.rear_quantity&&o.rear_model?`${q.rear_quantity} × ${o.rear_brand||o.brand} ${o.rear_model}`:null,"installed"].filter(Boolean).join(" · "));
  if(stateFee>0){
    body.set("line_items[1][quantity]","1");
    body.set("line_items[1][price_data][currency]","usd");
    body.set("line_items[1][price_data][unit_amount]",String(Math.round(stateFee*100)));
    body.set("line_items[1][price_data][tax_behavior]","exclusive");
    body.set("line_items[1][price_data][product_data][tax_code]","txcd_00000000");
    body.set("line_items[1][price_data][product_data][name]","New York State tire fee");
  }
  let extraIndex = stateFee > 0 ? 2 : 1;
  for (const item of extra) {
    const prefix = `line_items[${extraIndex++}]`;
    body.set(`${prefix}[quantity]`, "1");
    body.set(`${prefix}[price_data][currency]`, "usd");
    body.set(`${prefix}[price_data][unit_amount]`, String(Math.round(additionalItemAmount(item) * 100)));
    body.set(`${prefix}[price_data][tax_behavior]`, "exclusive");
    body.set(`${prefix}[price_data][product_data][tax_code]`, item.taxable ? "txcd_99999999" : "txcd_00000000");
    body.set(`${prefix}[price_data][product_data][name]`, item.description.slice(0, 250));
    body.set(`${prefix}[price_data][product_data][description]`, `${item.quantity} × $${item.unit_price.toFixed(2)}`);
  }
  if(!q.tax_exempt){body.set("automatic_tax[enabled]","true");body.set("billing_address_collection","required");body.set("customer_creation","always")}
  if(q.email)body.set("customer_email",q.email);

  const stripe=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  const session=await stripe.json();
  if(!stripe.ok)return NextResponse.json({error:session.error?.message||"Could not start payment"},{status:502});
  await admin.from("quotes").update({selected_option_id:o.id,status:"approved",payment_status:"pending",stripe_checkout_session_id:session.id,stripe_sales_tax_amount:null,updated_at:new Date().toISOString()}).eq("id",q.id);
  return NextResponse.json({clientSecret:session.client_secret,publishableKey});
}
