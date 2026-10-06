export const JHA_PPE = ["Safety glasses", "Hearing protection"] as const;
export type JhaStep = { task: string; hazards: string; controls: string; controlled: boolean };
export type JhaPhoto = { path: string; caption: string; category: "Before work" | "Hazard / control" | "After work"; url?: string };
export type JhaAssessment = {
  technician: string; steps: JhaStep[]; glasses: boolean; hearing: boolean;
  gloves: boolean; additionalPpe: string; notes: string; acknowledged: boolean;
  unsafeReason: string; photos: JhaPhoto[];
};
export type JhaStatus = "draft" | "complete" | "unsafe";
export const emptyJha = (): JhaAssessment => ({ technician: "", steps: [{ task: "Assess and set up the work area", hazards: "", controls: "", controlled: false }], glasses: false, hearing: false, gloves: false, additionalPpe: "", notes: "", acknowledged: false, unsafeReason: "", photos: [] });

const text = (value: unknown, max = 3000) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function normalizeJha(input: unknown): JhaAssessment {
  const x = (input && typeof input === "object" ? input : {}) as Partial<JhaAssessment>;
  return {
    technician: text(x.technician, 120), glasses: x.glasses === true, hearing: x.hearing === true,
    gloves: x.gloves === true, additionalPpe: text(x.additionalPpe), notes: text(x.notes),
    acknowledged: x.acknowledged === true, unsafeReason: text(x.unsafeReason),
    steps: (Array.isArray(x.steps) ? x.steps : []).slice(0, 20).map(s => ({ task: text(s?.task, 500), hazards: text(s?.hazards), controls: text(s?.controls), controlled: s?.controlled === true })),
    photos: (Array.isArray(x.photos) ? x.photos : []).slice(0, 12).map(p => ({ path: text(p?.path, 400), caption: text(p?.caption, 500), category: ["Before work", "Hazard / control", "After work"].includes(p?.category) ? p.category : "Before work" })),
  };
}
export function jhaValidation(assessment: JhaAssessment, status: JhaStatus): string | null {
  if (status === "unsafe") return assessment.unsafeReason ? null : "Describe the unresolved hazard before recording a work hold.";
  if (status === "draft") return null;
  if (!assessment.technician) return "Enter the technician’s name.";
  if (!assessment.steps.length || assessment.steps.some(s => !s.task || !s.hazards || !s.controls)) return "Complete the task, hazards and controls for every job step.";
  if (assessment.steps.some(s => !s.controlled)) return "Confirm each step’s controls are in place, or mark Unsafe to proceed.";
  if (!assessment.glasses || !assessment.hearing) return "Confirm safety glasses and hearing protection. Gloves are optional unless the task or site requires them.";
  if (!assessment.acknowledged) return "The technician must acknowledge the assessment.";
  if (assessment.unsafeReason) return "Resolve the work hold and clear its reason only after reassessing the hazards.";
  return null;
}
// Only supplier/job context, never changing payment or administrative fields.
export function jhaContext(job: Record<string, unknown>) {
  return Object.fromEntries(["service_type", "address", "scheduled", "vehicle", "tires", "size", "qty"].map(key => [key, job[key] ?? null]));
}
export function jhaReady(record: { status: string; context: Record<string, unknown>; assessment: unknown } | null, job: Record<string, unknown>) {
  return !!record && record.status === "complete" && jhaValidation(normalizeJha(record.assessment), "complete") === null
    && Object.entries(jhaContext(job)).every(([key, value]) => JSON.stringify(record.context?.[key] ?? null) === JSON.stringify(value));
}
export const JHA_MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export function jhaImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
