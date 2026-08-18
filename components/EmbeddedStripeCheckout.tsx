"use client";

import {useEffect,useRef,useState} from "react";

type EmbeddedCheckout={mount:(target:string|HTMLElement)=>void;destroy:()=>void};
type StripeClient={initEmbeddedCheckout:(options:{fetchClientSecret:()=>Promise<string>;onComplete:()=>void})=>Promise<EmbeddedCheckout>};
declare global{interface Window{Stripe?:(key:string)=>StripeClient}}

export default function EmbeddedStripeCheckout({publishableKey,clientSecret,onComplete}:{publishableKey:string;clientSecret:string;onComplete:()=>void}){
  const host=useRef<HTMLDivElement>(null);
  const[error,setError]=useState("");

  useEffect(()=>{
    let checkout:EmbeddedCheckout|undefined;
    let cancelled=false;
    const start=async()=>{
      try{
        if(!window.Stripe){
          await new Promise<void>((resolve,reject)=>{
            const existing=document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/clover/stripe.js"]');
            if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Stripe could not load")),{once:true});return}
            const script=document.createElement("script");script.src="https://js.stripe.com/clover/stripe.js";script.async=true;script.onload=()=>resolve();script.onerror=()=>reject(new Error("Stripe could not load"));document.head.appendChild(script);
          });
        }
        if(cancelled||!window.Stripe||!host.current)return;
        checkout=await window.Stripe(publishableKey).initEmbeddedCheckout({fetchClientSecret:async()=>clientSecret,onComplete});
        if(cancelled){checkout.destroy();return}
        checkout.mount(host.current);
      }catch(reason){setError(reason instanceof Error?reason.message:"Secure payment could not load")}
    };
    start();
    return()=>{cancelled=true;checkout?.destroy()};
  },[clientSecret,publishableKey,onComplete]);

  return <div className="embedded-checkout-shell"><div className="embedded-checkout-heading"><strong>Secure checkout</strong><span>Complete payment without leaving Bolt Tire.</span></div>{error?<div className="quote-error">{error}</div>:<div ref={host}/>}</div>;
}
