// Match delivery service types explicitly; an installation with delivery in its
// notes (or an unknown service type) must retain the installation safety checks.
export function isDeliveryService(serviceType?: string | null) {
  const value = (serviceType || "").trim().toLowerCase().replace(/\s+/g, " ");
  return ["delivery", "delivered", "delivery_pickup", "delivery / pickup", "delivery/pickup", "delivery and pickup"].includes(value);
}

export function jobCompletionError(serviceType: string | null | undefined, mileage: string, mileageConfirmed: boolean, torqueConfirmed: boolean) {
  if (isDeliveryService(serviceType)) return null;
  if (!mileage.trim()) return "Please enter vehicle mileage before completing the job.";
  if (!mileageConfirmed || !torqueConfirmed) return "Please confirm mileage and wheel torque before completing the job.";
  return null;
}

export function completionMileageUpdate(serviceType: string | null | undefined, mileage: string) {
  // A delivery does not record a new odometer reading or erase an existing one.
  return isDeliveryService(serviceType) ? {} : { vehicle_mileage: mileage.trim() || null };
}
