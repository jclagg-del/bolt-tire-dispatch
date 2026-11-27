// Optional: older vehicles/equipment can have shorter identifiers than modern VINs.
export function vinError(value: unknown): string | null {
  return value != null && (typeof value !== "string" || value.trim().length > 50)
    ? "Enter a VIN of no more than 50 characters." : null;
}

export function normalizeVin(value?: string | null): string | null {
  return value?.trim().toUpperCase() || null;
}
