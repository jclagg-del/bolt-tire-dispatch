export const formatDate = (date: string | Date) => {
  if (!date) return "";

  const d = new Date(date);

  // 🔥 Force New York timezone
  const ny = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  return ny; // returns YYYY-MM-DD
};