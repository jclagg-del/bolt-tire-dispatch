const DEFAULT_TEST_URL = "https://servicesstage.usautoforce.com/integrationservice.asmx";
const SOAP_NAMESPACE = "https://services.usautoforce.com";

type UsaForceConfig = {
  url: string;
  user: string;
  password: string;
  accountNumber: string;
};

export type UsaForceAvailability = {
  branch: string;
  quantity: number;
  deliveryDate: string | null;
  transferRequired: boolean;
};

export type UsaForceTire = {
  partNumber: string;
  description: string;
  model: string | null;
  tireSize: string | null;
  lineCodes: string[];
  cost: number | null;
  fet: number | null;
  quantityRequested: number | null;
  availability: UsaForceAvailability[];
};

function config(): UsaForceConfig {
  const user = process.env.USAF_API_USER?.trim();
  const password = process.env.USAF_API_PASSWORD;
  const accountNumber = process.env.USAF_ACCOUNT_NUMBER?.trim();
  if (!user || !password || !accountNumber) throw new Error("U.S. AutoForce API is not configured.");
  return {
    url: process.env.USAF_API_URL?.trim() || DEFAULT_TEST_URL,
    user,
    password,
    accountNumber,
  };
}

function escapeXml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function first(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : null;
}

function blocks(xml: string, tag: string) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi"))].map((match) => match[1]);
}

function number(value: string | null) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function envelope(configured: UsaForceConfig, body: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Header><Authentication xmlns="${SOAP_NAMESPACE}"><User>${escapeXml(configured.user)}</User><Password>${escapeXml(configured.password)}</Password></Authentication></soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

async function call(method: string, request: string) {
  const configured = config();
  const response = await fetch(configured.url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"${SOAP_NAMESPACE}/${method}"`,
    },
    body: envelope(configured, request),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`U.S. AutoForce returned HTTP ${response.status}.`);
  const fault = first(xml, "faultstring");
  if (fault) throw new Error(fault);
  const errorCode = first(xml, "errorCode");
  const errorMessage = first(xml, "errorMessage");
  if (errorCode && errorCode.toLowerCase() !== "success") {
    throw new Error(errorMessage || `U.S. AutoForce error: ${errorCode}`);
  }
  return { xml, configured, errorCode, errorMessage };
}

function transactionId(prefix: string) {
  return `bolt-${prefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function usaForceServiceCheck() {
  const configured = config();
  const transaction = transactionId("service");
  const { xml } = await call("ServiceCheck", `<ServiceCheck xmlns="${SOAP_NAMESPACE}"><request><revision>1.0</revision><transactionId>${transaction}</transactionId><accountNumber>${escapeXml(configured.accountNumber)}</accountNumber></request></ServiceCheck>`);
  return { ok: true, dateTime: first(xml, "dateTime"), environment: configured.url.includes("stage") ? "test" : "production" };
}

export async function usaForceStockCheck(tireSize: string, quantity = 4) {
  const normalized = tireSize.replace(/\D/g, "");
  if (normalized.length < 5 || normalized.length > 10) throw new Error("Enter a valid tire size using digits only.");
  const requestedQuantity = Math.max(1, Math.min(20, Math.trunc(quantity)));
  const configured = config();
  const transaction = transactionId("stock");
  const { xml } = await call("StockCheck", `<StockCheck xmlns="${SOAP_NAMESPACE}"><request><revision>1.0</revision><transactionId>${transaction}</transactionId><accountNumber>${escapeXml(configured.accountNumber)}</accountNumber><alternateFlag>no</alternateFlag><dataSource>catalog</dataSource><tires><TireDto><lineNumber>1</lineNumber><tireSize>${escapeXml(normalized)}</tireSize><quantityRequested>${requestedQuantity}</quantityRequested></TireDto></tires></request></StockCheck>`);

  const tires = blocks(first(xml, "tires") || "", "TireDto").map((tire): UsaForceTire => ({
    partNumber: first(tire, "partNumber") || "",
    description: first(tire, "description") || "",
    model: first(tire, "model"),
    tireSize: first(tire, "tireSize"),
    lineCodes: blocks(first(tire, "lineCodes") || "", "string").map(decodeXml),
    cost: number(first(tire, "cost")),
    fet: number(first(tire, "fet")),
    quantityRequested: number(first(tire, "quantityRequested")),
    availability: blocks(first(tire, "quantityAvailable") || "", "BranchDto").map((branch) => ({
      branch: first(branch, "code") || "",
      quantity: number(first(branch, "quantityAvailable")) || 0,
      deliveryDate: first(branch, "deliveryDate"),
      transferRequired: first(branch, "transferRequired")?.toLowerCase() === "true",
    })),
  }));

  return { tireSize: normalized, quantity: requestedQuantity, tires, environment: configured.url.includes("stage") ? "test" : "production" };
}
