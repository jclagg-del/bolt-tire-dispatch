type OrderReference = { id: number; customer: string; job_number: string | null };

/** Advisory only: a repeated customer PO must never remove or combine requests.
 * Tire part numbers are intentionally not keys; many vehicles use the same tire.
 */
export function possibleDuplicateOrders(orders: OrderReference[]): Record<number, number[]> {
  const groups = new Map<string, Set<number>>();
  for (const order of orders) {
    const po = order.job_number?.trim().toUpperCase();
    if (!po) continue;
    const key = JSON.stringify([order.customer.trim().toUpperCase(), po]);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(order.id);
  }
  const matches: Record<number, number[]> = {};
  for (const ids of groups.values()) {
    if (ids.size < 2) continue;
    for (const id of ids) matches[id] = [...ids].filter(other => other !== id).sort((a, b) => b - a);
  }
  return matches;
}
