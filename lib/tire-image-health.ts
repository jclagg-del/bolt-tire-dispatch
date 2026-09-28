import "server-only";

const hosts = new Set(["tireweb.tirelibrary.com", "images.atdonline.com", "storage.googleapis.com"]);
export function allowedTireImage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && hosts.has(url.hostname);
  } catch { return false; }
}

const health = new Map<string, { expires: number; result: Promise<boolean> }>();
let active = 0;
const waiting: Array<() => void> = [];
async function checkImage(url: string): Promise<boolean> {
  if (active >= 8) await new Promise<void>(resolve => waiting.push(resolve));
  active++;
  try {
    // Never send account credentials to image hosts or follow redirects to other hosts.
    let current = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!allowedTireImage(current)) return false;
      let response = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4000), cache: "no-store" });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = response.headers.get("location");
        if (!target) return false;
        current = new URL(target, current).href;
        continue;
      }
      if (response.status === 405 || response.status === 501) {
        response = await fetch(current, { headers: { Range: "bytes=0-0" }, redirect: "manual", signal: AbortSignal.timeout(4000), cache: "no-store" });
        await response.body?.cancel();
      }
      return response.ok && (response.headers.get("content-type") || "").toLowerCase().startsWith("image/");
    }
    return false;
  } catch { return false; }
  finally { active--; waiting.shift()?.(); }
}

export async function healthyTireImage(url: string): Promise<boolean> {
  if (!allowedTireImage(url)) return false;
  const cached = health.get(url);
  if (cached && cached.expires > Date.now()) return cached.result;
  if (health.size >= 2048) health.delete(health.keys().next().value!);
  const entry = { expires: Date.now() + 60_000, result: Promise.resolve(false) };
  entry.result = checkImage(url).then(ok => {
    // Briefly cache failures so temporary source outages can recover promptly.
    entry.expires = Date.now() + (ok ? 15 * 60_000 : 60_000);
    return ok;
  });
  health.set(url, entry);
  return entry.result;
}

export async function firstHealthyTireImage(candidates: Array<string | null | undefined>): Promise<string | null> {
  for (const url of new Set(candidates.filter((item): item is string => Boolean(item)))) {
    if (await healthyTireImage(url)) return url;
  }
  return null;
}

// Photo matching only. Do not use these keys to merge SKUs, prices, or specifications.
export function tireImageBrand(brand: string): string {
  const key = brand.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(?:tires|tyres)$/, "");
  return key === "argusadvanta" ? "advanta" : key;
}
export function tireImageModel(brand: string, model: string): string {
  let key = model.toLowerCase().replace(/[^a-z0-9]/g, "");
  const make = tireImageBrand(brand);
  if (make && key.startsWith(make)) key = key.slice(make.length);
  return key;
}
export function tireImageKey(brand: string, model: string): string {
  return `${tireImageBrand(brand)}:${tireImageModel(brand, model)}`;
}
