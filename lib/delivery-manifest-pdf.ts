import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { DeliveryManifest } from "@/lib/delivery-manifest";
import { validRouteDate } from "@/lib/route-order";

const clean = (value: string) => value.replace(/[\r\n\t]+/g, " ").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xa0-\xff]/g, "?").trim();
function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []; let line = "";
  for (const word of clean(value).split(/\s+/)) {
    if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) { line = line ? `${line} ${word}` : word; continue; }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ""; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export async function deliveryManifestPdf(manifest: DeliveryManifest, scalePercent = 100, logo?: Uint8Array) {
  if (![75,80,90,100].includes(scalePercent)) throw new Error("Choose a supported print size.");
  if (!validRouteDate(manifest.date) || !manifest.lines.length || !manifest.receivingSite.trim()) throw new Error("Choose a receiving site and deliveries before printing.");
  if (manifest.lines.some(line => !Number.isSafeInteger(line.quantity) || line.quantity < 1)
    || manifest.total !== manifest.lines.reduce((n,line) => n + line.quantity, 0)) throw new Error("Check the delivery quantities before printing.");
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoImage = logo ? await doc.embedPng(logo) : null;
  const site = wrap(`${manifest.organization === "HPR" ? "HPR" : "KINGDOM"} / ${manifest.receivingSite.toUpperCase()}`, bold, 16, 256);
  if (site.length > 3) throw new Error("The receiving site name is too long for a 4 x 6 label. Use a shorter receiving-site name.");
  const firstY = 270 - (site.length - 1) * 18;
  const rows = manifest.lines.map(line => {
    const refs = wrap(`JOB ${line.jobNumber}   MO ${line.moNumber}`, bold, 10.5, 200);
    const description = wrap(line.tires, regular, 9, 232);
    const destination = wrap(`${line.size}    Final: ${line.finalSite}`, bold, 10, 232);
    return { line, refs, description, destination, height: refs.length * 13 + description.length * 11 + destination.length * 12 + 22 };
  });
  const pages: typeof rows[] = []; let current: typeof rows = [], y = firstY;
  for (const row of rows) {
    if (firstY - row.height + 11 < 105) throw new Error(`Job ${row.line.jobNumber} contains too much text for a label. Review its tire and MO descriptions before printing.`);
    if (y - row.height + 11 < 105 && current.length) { pages.push(current); current = []; y = firstY; }
    current.push(row); y -= row.height;
  }
  if (current.length) pages.push(current);
  doc.setTitle(`Bill of lading ${manifest.reference}`);
  const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${manifest.date}T12:00:00Z`)).toUpperCase();
  for (const [index, pageRows] of pages.entries()) {
    const page = doc.addPage([288,432]);
    const text = (value: string, x: number, at: number, size = 10, strong = false) => page.drawText(clean(value), { x, y: at, size, font: strong ? bold : regular });
    const right = (value: string, at: number, size = 9, strong = false) => text(value, 272 - (strong ? bold : regular).widthOfTextAtSize(clean(value), size), at, size, strong);
    const rule = (at: number) => page.drawLine({ start: {x:16,y:at}, end:{x:272,y:at}, thickness:.6 });
    if (logoImage) page.drawImage(logoImage, { x:16,y:394,width:130,height:22.3 });
    else text("BOLT TIRE",16,398,20,true);
    text("BILL OF LADING",16,374,17,true); right(dateLabel,376,9,true);
    text(`BOL: ${manifest.reference}`,16,359,8); right(`PAGE ${index + 1} OF ${pages.length}`,359,8);
    rule(350); text("DELIVER TO",16,337,8,true);
    site.forEach((value,i) => text(value,16,318-i*18,16,true));
    text("Verify all tires at handoff; final sites listed below.",16,305-(site.length-1)*18,8);
    rule(296-(site.length-1)*18);
    text("CHECK EACH LINE AT HANDOFF",16,284-(site.length-1)*18,8,true);
    text("QTY",240,284-(site.length-1)*18,8,true);
    let cursor = firstY;
    for (const row of pageRows) {
      page.drawRectangle({ x:16,y:cursor-1,width:11,height:11,borderWidth:.9,borderColor:rgb(0,0,0) });
      const qty = String(row.line.quantity);
      let qtySize = 18;
      while (bold.widthOfTextAtSize(qty,qtySize) > 30 && qtySize > 8) qtySize -= .5;
      if (bold.widthOfTextAtSize(qty,qtySize) > 30) throw new Error("A tire quantity is too large to print safely.");
      text(qty,259-bold.widthOfTextAtSize(qty,qtySize),cursor-3,qtySize,true);
      let rowY = cursor+1;
      for (const value of row.refs) { text(value,34,rowY,10.5,true); rowY-=13; }
      for (const value of row.description) { text(value,34,rowY,9); rowY-=11; }
      for (const value of row.destination) { text(value,34,rowY,10,true); rowY-=12; }
      text("Received qty: ______",34,rowY-2,9);
      rule(cursor-row.height+11); cursor -= row.height;
    }
    const subtotal = pageRows.reduce((sum,row) => sum+row.line.quantity,0);
    text(pages.length === 1 ? `TOTAL EXPECTED: ${manifest.total} TIRES` : `THIS PAGE: ${subtotal}  /  SHIPMENT: ${manifest.total}`,16,91,11,true);
    text(pages.length === 1 ? "Total received: ______" : "Received on this page: ______",16,76,10);
    text("Received by:",16,59,9); page.drawLine({start:{x:76,y:57},end:{x:272,y:57},thickness:.5});
    text("Signature:",16,40,9); page.drawLine({start:{x:66,y:38},end:{x:192,y:38},thickness:.5});
    text("Time:",202,40,9); page.drawLine({start:{x:228,y:38},end:{x:272,y:38},thickness:.5});
    text("Short / damaged:",16,22,8); page.drawLine({start:{x:82,y:20},end:{x:272,y:20},thickness:.5});
    text("4 x 6 PORTRAIT | VERIFY RECEIPT BEFORE SIGNING",16,8,6.5);
    const scale = scalePercent/100;
    page.scaleContent(scale,scale); page.translateContent(288*(1-scale)/2,432*(1-scale)/2);
  }
  return { bytes: await doc.save(), pages: pages.length };
}
