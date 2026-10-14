// Match delivery service types explicitly; an installation with delivery in its
// notes (or an unknown service type) must retain the installation safety checks.
export function isDeliveryService(serviceType?: string | null) {
  const value = (serviceType || "").trim().toLowerCase().replace(/\s+/g, " ");
  return ["delivery", "delivered", "delivery_pickup", "delivery / pickup", "delivery/pickup", "delivery and pickup"].includes(value);
}

export function wheelTorqueError(value: string): string | null {
  const clean = value.trim();
  if (!clean) return null; // Optional measurement; never invent a default.
  return /^\d+(?:\.\d+)?$/.test(clean) && Number.isFinite(Number(clean)) && Number(clean) > 0
    ? null : "Enter a torque value greater than zero in ft-lb, or leave it blank.";
}

export function completionTorqueUpdate(serviceType: string | null | undefined, value: string) {
  if (isDeliveryService(serviceType)) return {};
  const error = wheelTorqueError(value);
  if (error) throw new Error(error);
  return { wheel_torque_ft_lb: value.trim() ? Number(value.trim()) : null };
}

export function jobCompletionError(serviceType: string | null | undefined, mileage: string, mileageConfirmed: boolean, torqueConfirmed: boolean, torqueFtLb = "") {
  if (isDeliveryService(serviceType)) return null;
  if (!mileage.trim()) return "Please enter vehicle mileage before completing the job.";
  if (!mileageConfirmed || !torqueConfirmed) return "Please confirm mileage and wheel torque before completing the job.";
  return wheelTorqueError(torqueFtLb);
}

export function completionMileageUpdate(serviceType: string | null | undefined, mileage: string) {
  // A delivery does not record a new odometer reading or erase an existing one.
  return isDeliveryService(serviceType) ? {} : { vehicle_mileage: mileage.trim() || null };
}
