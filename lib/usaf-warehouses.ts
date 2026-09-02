export const USAF_REGIONAL_WAREHOUSES: Record<string, { name: string; address: string }> = {
  "4852": { name: "Hauppauge, NY", address: "45 Oser Ave, Hauppauge, NY 11788" },
  "4853": { name: "Croton-on-Hudson, NY", address: "1 Half Moon Bay Drive, Croton-on-Hudson, NY 10520" },
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
