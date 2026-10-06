import { supabase } from "@/lib/supabase";

export async function jhaRequest(jobId: string | number, suffix = "", options: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Please sign in again to access the JHA.");
  const response = await fetch(`/api/jobs/${encodeURIComponent(String(jobId))}/jha${suffix}`, {
    ...options, cache: "no-store", headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers, Authorization: `Bearer ${data.session.access_token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "JHA request failed. Nothing was saved.");
  return result;
}
export async function requireCompletedJha(jobId: string | number) {
  try {
    const result = await jhaRequest(jobId);
    if (result.ready) return true;
    window.alert(result.record?.status === "unsafe" ? "Work is on hold. Resolve the hazards and complete the JHA before completing this job or task." : "Complete the JHA for this job or task first. Use the JHA button on this page.");
  } catch (error) { window.alert(error instanceof Error ? error.message : "Unable to verify JHA completion."); }
  return false;
}

// Resize and re-encode phone images before upload: strips embedded location
// metadata and keeps uploads below the hosting request limit.
export async function prepareJhaPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("This photo format could not be opened. Choose a JPEG or take a new photo.")); image.src = url; });
    const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable on this device.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to prepare photo.")), "image/jpeg", 0.82));
  } finally { URL.revokeObjectURL(url); }
}
