import { blocks, call, escapeXml as x, first, usaForceOrderingStatus } from "./usaf";
import { regionalUsafWarehouse } from "./usaf-warehouses";
import { deliveryDate } from "./customer-order-purchasing";

const namespace = "https://services.usautoforce.com";
const account = () => process.env.USAF_ACCOUNT_NUMBER?.trim() || "";
const base = (transaction: string) => `<revision>1.0</revision><transactionId>${x(transaction)}</transactionId><accountNumber>${x(account())}</accountNumber>`;
const request = (method: string, content: string) => `<${method} xmlns="${namespace}"><request>${content}</request></${method}>`;
const round = (value: number) => Math.round(value * 100) / 100;
function amount(xml: string, field: string) {
  const raw = first(xml, field);
  return raw == null ? null : Number.isFinite(Number(raw)) ? Number(raw) : null;
}
function validatePart(part: string, quantity: number) {
  if (!part.trim() || part.length > 28 || !Number.isInteger(quantity) || quantity < 1 || quantity > 24) throw new Error("A valid product number and quantity are required.");
}
function partXml(part: string, quantity: number, lineCode = "", branch = "", calculateDelivery = false) {
  return `<parts><PartDto><lineNumber>1</lineNumber><lineCode>${x(lineCode)}</lineCode><partNumber>${x(part)}</partNumber>${branch ? `<branch>${x(branch)}</branch>` : ""}<quantityRequested>${quantity}</quantityRequested>${calculateDelivery ? "<calculateDeliveryCost>yes</calculateDeliveryCost>" : ""}</PartDto></parts>`;
}

export async function searchUsafOrderProduct(part: string, quantity: number, lineCode = "") {
  validatePart(part, quantity);
  const { xml } = await call("StockCheck", request("StockCheck", `${base(crypto.randomUUID())}<alternateFlag>no</alternateFlag><dataSource>manual</dataSource>${partXml(part, quantity, lineCode)}`));
  const result = blocks(xml, "StockCheckResult")[0];
  const choices = blocks(result, "ChoosePartDto");
  if (choices.length) return choices.map(item => ({
    atdProductNumber: first(item, "partNumber") || part, lineCode: first(item, "lineCode") || "", brand: first(item, "lineDescription") || "", model: first(item, "description") || "", size: "", loadSpeed: "", cost: null, fet: 0, fee: 0, core: 0, tax: 0, warehouses: [] as Array<{ code: string; name: string; local: boolean; quantity: number; deliveryDate: string | null; cutoff: string | null }>,
  }));
  return blocks(result, "PartDto").map(item => {
    const code = first(item, "errorCode");
    if (code && code.toLowerCase() !== "success") throw new Error(first(item, "errorMessage") || "U.S. AutoForce could not identify this part.");
    return {
      atdProductNumber: first(item, "partNumber") || "", lineCode: first(item, "lineCode") || "", brand: first(item, "manufacturer") || "", model: first(item, "description") || "", size: first(item, "tireSize") || "", loadSpeed: "",
      cost: amount(item, "cost"), fet: amount(item, "fet") || 0, fee: amount(item, "fee") || 0, core: amount(item, "core") || 0, tax: amount(item, "tax") || 0,
      warehouses: blocks(blocks(item, "quantityAvailable")[0] || "", "BranchDto").flatMap(branch => {
        const code = first(branch, "code") || "";
        const region = regionalUsafWarehouse(code);
        return region ? [{ code, name: region.name, local: Boolean(region.local), quantity: amount(branch, "quantityAvailable") || 0, deliveryDate: deliveryDate(first(branch, "deliveryDate")), cutoff: first(branch, "cutoffDateTime") }] : [];
      }).sort((a, b) => Number(b.local) - Number(a.local) || a.name.localeCompare(b.name)),
    };
  }).filter(item => item.atdProductNumber.toUpperCase() === part.toUpperCase() && Boolean(item.lineCode));
}

export async function previewUsafOrder(input: { part: string; lineCode: string; branch: string; quantity: number; po: string }) {
  if (!input.po || input.po.length > 15) throw new Error("U.S. AutoForce requires the job / PO number to be 15 characters or fewer.");
  if (!input.lineCode || input.lineCode.length > 4) throw new Error("Choose the matching U.S. AutoForce tire first.");
  const products = await searchUsafOrderProduct(input.part, input.quantity, input.lineCode);
  const product = products.find(item => item.lineCode === input.lineCode);
  const warehouse = product?.warehouses.find(item => item.code === input.branch);
  if (!product || product.cost == null || !Number.isFinite(product.cost) || product.cost <= 0) throw new Error("U.S. AutoForce did not return a valid price for this tire.");
  if (!warehouse || warehouse.quantity < input.quantity) throw new Error("This warehouse cannot fill the requested quantity. Choose an available regional warehouse.");
  const { xml } = await call("OrderDeadline", request("OrderDeadline", `${base(crypto.randomUUID())}<orderType>NORMAL</orderType><deliveryMethod>USAF-TRK</deliveryMethod><fillFlag>cancelorder</fillFlag><shipTo><shipToCode>${x(account())}</shipToCode></shipTo>${partXml(input.part, input.quantity, input.lineCode, input.branch, true)}`));
  const deadline = blocks(xml, "OrderDeadlineResult")[0];
  const branch = blocks(deadline, "BranchDto").find(item => first(item, "code") === input.branch);
  if (!branch) throw new Error("U.S. AutoForce did not confirm delivery for the selected warehouse.");
  const expectedDate = deliveryDate(first(branch, "deliveryDate"));
  const freight = amount(branch, "deliveryCost");
  if (freight == null || freight < 0) throw new Error("U.S. AutoForce did not return a delivery charge. Confirm freight with the supplier before ordering.");
  const total = round((product.cost + product.fet + product.fee + product.core + product.tax) * input.quantity + freight);
  const warning = first(deadline, "text") || "Supplier estimate includes quoted tire charges and delivery. Additional supplier surcharges or taxes may appear on the invoice.";
  return { supplier: "U.S. AutoForce", order: { ordertotal: total, thresholdmessage: warning, orderlines: [{ description: product.model, fulfillments: [{ quantity: input.quantity, sourcedcname: warehouse.name, estimateddelivery: expectedDate, shipmethod: "U.S. AutoForce truck", status: "Available", freight, branch: input.branch, cutoffDateTime: first(branch, "cutoffDateTime") }] }] }, product, branch: input.branch, lineCode: input.lineCode };
}

export async function placeUsafOrder(input: { part: string; lineCode: string; branch: string; quantity: number; po: string; mo: string; transaction: string }, preview: Awaited<ReturnType<typeof previewUsafOrder>>) {
  if (!usaForceOrderingStatus().production) throw new Error("U.S. AutoForce production ordering is not configured.");
  // Never retry a purchase after a timeout; the supplier may already have accepted it.
  const { xml } = await call("Order", request("Order", `${base(input.transaction)}<orderType>NORMAL</orderType><fillFlag>cancelorder</fillFlag><branch>${x(input.branch)}</branch><poNumber>${x(input.po)}</poNumber><deliveryMethod>USAF-TRK</deliveryMethod><shipTo><shipToCode>${x(account())}</shipToCode></shipTo><billTo><billToCode>${x(account())}</billToCode></billTo>${partXml(input.part, input.quantity, input.lineCode)}<comments><CommentDto><type>vehicle</type><text>${x(`Job ${input.po} | MO ${input.mo}`)}</text></CommentDto></comments>`));
  const result = blocks(xml, "OrderResult")[0];
  const confirmation = first(result, "orderNumber");
  const status = first(result, "status") || "";
  if (!confirmation || /cancel|fail|reject/i.test(status)) throw new Error(first(result, "errorMessage") || "U.S. AutoForce did not confirm the order.");
  const lines = blocks(result, "PartDto");
  if (lines.some(line => { const code = first(line, "errorCode"); return code && code.toLowerCase() !== "success"; })) throw new Error("U.S. AutoForce returned a line error. Check the supplier order before retrying.");
  // Preserve the estimate returned by OrderDeadline if order detail is not yet ready.
  let expected = preview.order.orderlines[0].fulfillments[0].estimateddelivery;
  let total = preview.order.ordertotal;
  let estimateOnly = true;
  try {
    const detail = await call("OrderStatusDetail", request("OrderStatusDetail", `${base(crypto.randomUUID())}<branch>${x(input.branch)}</branch><orderNumber>${x(confirmation)}</orderNumber><poNumber>${x(input.po)}</poNumber>`));
    const response = blocks(detail.xml, "OrderStatusDetailResult")[0];
    if (first(response, "orderNumber") === confirmation) {
      expected = deliveryDate(first(response, "deliveryDate")) || expected;
      const confirmedTotal = amount(response, "totalCost");
      if (confirmedTotal != null && confirmedTotal > 0) { total = confirmedTotal; estimateOnly = false; }
    }
  } catch { /* Purchase is confirmed even if the detail lookup is not ready. */ }
  return { supplier: "U.S. AutoForce", estimateOnly, order: { ordertotal: total, confirmationnumber: confirmation, thresholdmessage: first(result, "comment") || preview.order.thresholdmessage, orderlines: [{ description: preview.product.model, fulfillments: [{ ...preview.order.orderlines[0].fulfillments[0], estimateddelivery: expected, status }] }] } };
}
