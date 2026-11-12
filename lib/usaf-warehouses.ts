export const USAF_REGIONAL_WAREHOUSES: Record<string, { name: string; address: string; local?: boolean }> = {
  "4852": { name: "Hauppauge, NY", address: "45 Oser Ave, Hauppauge, NY 11788" },
  "4853": { name: "Croton-on-Hudson, NY", address: "1 Half Moon Bay Drive, Croton-on-Hudson, NY 10520", local: true },
  "4854": { name: "Kirkwood, NY", address: "1 Grossett Drive, Kirkwood, NY 13795" },
  "4855": { name: "South Windsor, CT", address: "555 Nutmeg Road North, South Windsor, CT 06074" },
  "4859": { name: "Myerstown, PA", address: "100 Fort Motel Road, Myerstown, PA 17067" },
  "4860": { name: "Parsippany, NJ", address: "2 Hilton Ct, Parsippany, NJ 07054" },
  "4862": { name: "Northborough, MA", address: "150 Hayes Memorial Drive, Northborough, MA 01532" },
  "4863": { name: "Bordentown, NJ", address: "2473 Old York Road, Bordentown, NJ 08505" },
};

export function regionalUsafWarehouse(warehouse: string) {
  return USAF_REGIONAL_WAREHOUSES[String(warehouse).trim()] || null;
}

// Verified against U.S. AutoForce's own directory on 2026-11-12:
// https://oneplatform.usautoforce.com/warehousehours/
// Naming a transfer warehouse must NOT reclassify it as nearby inventory.
const USAF_TRANSFER_WAREHOUSES: Record<string, { name: string; address: string }> = {
  "4857": { name: "Lewiston, ME", address: "9 Gendron Drive, Lewiston, ME 04240" },
  "4858": { name: "Randolph Center, VT", address: "2281B Route 66, Randolph Center, VT 05061" },
  "4861": { name: "Rochester, NY", address: "401 Pixley Road, Rochester, NY 14602" },
  "4864": { name: "Hanover, MD", address: "1425 Magellan Road, Hanover, MD 21076" },
  "4865": { name: "Winchester, VA", address: "40 Tyson Drive, Winchester, VA 22601" },
  "4866": { name: "Colonial Heights, VA", address: "1962 Ruffin Mill Road, Colonial Heights, VA 23834" },
  "4867": { name: "Imperial, PA", address: "200 Solar Drive, Imperial, PA 15126" },
};

// These directories supply labels, not an inventory allowlist.
export function usafWarehouse(warehouse: string) {
  const region = regionalUsafWarehouse(warehouse);
  const location = region || USAF_TRANSFER_WAREHOUSES[String(warehouse).trim()];
  return {
    name: location?.name || `U.S. AutoForce warehouse ${String(warehouse).trim()}`,
    address: location?.address || "",
    local: Boolean(region?.local),
    regional: Boolean(region),
  };
}

export function usafCatalogInventory(inventory: Array<{ warehouse: string; quantity: number }>) {
  const warehouses = inventory
    .filter(item => String(item.warehouse).trim() && Number(item.quantity) > 0)
    .map(item => ({ ...item, quantity: Number(item.quantity), ...usafWarehouse(item.warehouse) }));
  return {
    warehouses,
    localQuantity: warehouses.filter(item => item.local).reduce((sum, item) => sum + item.quantity, 0),
    regionalQuantity: warehouses.filter(item => item.regional && !item.local).reduce((sum, item) => sum + item.quantity, 0),
    availableQuantity: warehouses.reduce((sum, item) => sum + item.quantity, 0),
  };
}
