import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { TireLabelJob } from "@/components/TireLabelPrint";

export const labelCount = (quantity?: number | null) => Math.max(1, Math.min(24, Math.floor(Number(quantity) || 1)));

function printable(value: unknown) {
  // Standard PDF fonts support Latin text. Normalize punctuation and replace
  // unsupported glyphs visibly rather than crashing or silently dropping words.
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/[–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\xa0-\xff]/g, "?").trim();
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const letter of word) {
      if (font.widthOfTextAtSize(line + letter, size) > width && line) { lines.push(line); line = ""; }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function block(page: PDFPage, value: unknown, font: PDFFont, x: number, top: number, width: number, height: number, preferred: number, minimum = 8) {
  const text = printable(value) || "-";
  for (let size = preferred; size >= minimum; size -= 0.5) {
    const lines = wrap(text, font, size, width);
    const leading = size * 1.2;
    if (lines.length * leading > height) continue;
    lines.forEach((line, index) => page.drawText(line, { x, y: top - size - index * leading, size, font }));
    return;
  }
  throw new Error("There is too much text for a 4 x 6 label. Shorten the job's tire or customer information and try again.");
}

export async function tireLabelPdf(job: TireLabelJob, scalePercent = 80): Promise<Uint8Array> {
  if (![75,80,90,100].includes(scalePercent)) throw new Error("Choose a supported label print size.");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const quantity = labelCount(job.quantity);
  const date = job.scheduled ? new Date(job.scheduled) : null;
  const serviceDate = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York",month:"short",day:"numeric",year:"numeric"}).format(date) : "Not scheduled";
  for (let index = 0; index < quantity; index++) {
    const page = doc.addPage([288, 432]); // Exactly 4 x 6 inches, no browser scaling.
    const rule = (y: number) => page.drawLine({start:{x:14,y},end:{x:274,y},thickness:0.7});
    const caption = (text: string, x: number, y: number) => page.drawText(text,{x,y,size:7,font:regular});
    block(page,"BOLT TIRE",bold,14,414,148,25,20);
    block(page,String(job.serviceType || "Tire Service").toUpperCase(),bold,172,414,102,25,10);
    rule(383);
    caption("JOB NUMBER",14,371);
    block(page,job.jobNumber || job.id,bold,14,366,260,42,30);
    caption("MO NUMBER",14,314); caption("LABEL",172,314);
    block(page,job.moNumber,bold,14,309,148,30,12);
    block(page,`${index+1} OF ${quantity}`,bold,172,309,102,30,14);
    rule(272); caption("TIRE",14,259);
    block(page,[job.tires,job.size].filter(Boolean).join(" - ") || "Tire information not entered",bold,14,250,260,82,16,9);
    block(page,`Part #: ${job.productNumber || "Not provided"}`,regular,14,161,260,30,11);
    rule(122);
    caption("CUSTOMER / FACILITY",14,108); caption("SERVICE DATE",172,108);
    block(page,job.facilityName || job.customer,bold,14,102,148,50,12);
    block(page,serviceDate,bold,172,102,102,50,11);
    if (job.vehicle) block(page,job.vehicle,regular,14,43,260,29,10);
    const scale = scalePercent / 100;
    page.scaleContent(scale, scale);
    page.translateContent(288 * (1 - scale) / 2, 432 * (1 - scale) / 2);
  }
  return doc.save();
}

// Brother's documented PDF + fileattach handoff: no public job URL, storage
// upload, login cookie, or access token is sent to the external application.
export function smoothPrintUrl(bytes: Uint8Array, filename: string, gapMm = 3): string {
  if (!Number.isFinite(gapMm) || gapMm < 0 || gapMm > 10) throw new Error("Label gap must be between 0 and 10 mm.");
  if (!/^bolt-labels-[a-z0-9-]+\.pdf$/i.test(filename)) throw new Error("Invalid label filename.");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const params = new URLSearchParams({filename,fileattach:btoa(binary),copies:"1",paperType:"dieCut",unit:"mm",tapeWidth:"101.6",tapeLength:"152.4",gapLength:String(gapMm),orientation:"portrait",printMode:"original",rotate:"Rotate0",peelMode:"0",formatarchiveupdate:"1"});
  return `brotherwebprint://print?${params}`;
}
