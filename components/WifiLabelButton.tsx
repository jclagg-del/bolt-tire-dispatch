"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import TireLabelPrint, { type TireLabelJob } from "./TireLabelPrint";

export default function WifiLabelButton({ job, disabled, style }: {
  job: TireLabelJob;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const [printJob, setPrintJob] = useState<TireLabelJob | null>(null);
  useEffect(() => {
    const clear = () => setPrintJob(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

  function print() {
    // Mount and fit every label before opening the native print dialog.
    // Keep this in the click gesture so iPhone Safari can open AirPrint.
    flushSync(() => setPrintJob({ ...job }));
    window.print();
  }

  return <>
    <button type="button" disabled={disabled} style={style} onClick={print}>Print via Wi-Fi</button>
    <TireLabelPrint job={printJob} />
  </>;
}
