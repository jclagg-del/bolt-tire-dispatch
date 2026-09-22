export const shopSessionKey = "bolt-tire-shop-return-v1";
export const quoteDraftKey = "bolt-tire-quote-draft-v1";

export function readShoppingSession<T>(storage: Pick<Storage, "getItem" | "removeItem">, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Number.isFinite(saved.savedAt) || !saved.value || Date.now() - saved.savedAt > 8 * 60 * 60 * 1000) {
      storage.removeItem(key);
      return null;
    }
    return saved.value as T;
  } catch { return null; }
}

export function saveShoppingSession(storage: Pick<Storage, "setItem">, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), value }));
}
