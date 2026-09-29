/** Keep the existing job wall-clock format; supplier delivery is independent. */
export function orderAppointment(
  requestedDate: string | null,
  requestedTime: string | null,
  scheduledDate?: unknown,
  scheduledTime?: unknown,
): string | null {
  const date = scheduledDate === undefined ? requestedDate || "" : scheduledDate;
  const time = scheduledTime === undefined ? (requestedTime || "").slice(0, 5) : scheduledTime;
  if (date === "" && time === "") return null;
  if (typeof date !== "string" || typeof time !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Enter both a valid scheduled date and time before approving.");
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Enter a valid scheduled date before approving.");
  }
  return `${date}T${time}:00`;
}
