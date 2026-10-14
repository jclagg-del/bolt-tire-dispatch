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
export type JhaIssue = { step: 0 | 2; message: string };
// Exact, explicit no-hazard responses only. Never match substrings such as
// “not safe”, “safe except for traffic”, or “no controls”. Preserve the raw text.
export function jhaHasWorkHold(reason: string): boolean {
  const value = reason.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "").trim();
  return !["", "safe", "none", "n/a", "na", "no hazards", "no unresolved hazards", "no issues", "not applicable"].includes(value);
}
export function jhaCompletionIssues(assessment: JhaAssessment): JhaIssue[] {
  const issues: JhaIssue[] = [];
  if (!assessment.technician.trim()) issues.push({ step: 0, message: "Enter the technician’s name." });
  if (!assessment.steps.length) issues.push({ step: 0, message: "Add at least one work step." });
  assessment.steps.forEach((item, index) => {
    for (const [key, label] of [["task", "task / work step"], ["hazards", "hazards"], ["controls", "controls"]] as const) {
      if (!item[key].trim()) issues.push({ step: 0, message: `Step ${index + 1}: enter the ${label}.` });
    }
    if (!item.controlled) issues.push({ step: 0, message: `Step ${index + 1}: check “Controls are in place” after confirming them.` });
  });
  if (!assessment.glasses) issues.push({ step: 0, message: "Confirm safety glasses." });
  if (!assessment.hearing) issues.push({ step: 0, message: "Confirm hearing protection." });
  if (jhaHasWorkHold(assessment.unsafeReason)) issues.push({ step: 2, message: "An unresolved hazard is entered. Resolve and reassess it, then update the work-hold response on Review." });
  if (!assessment.acknowledged) issues.push({ step: 2, message: "Check the final assessment confirmation on Review." });
  return issues;
}
export function jhaValidation(assessment: JhaAssessment, status: JhaStatus): string | null {
  if (status === "unsafe") return jhaHasWorkHold(assessment.unsafeReason) ? null : "Describe the unresolved hazard before recording a work hold. If it is safe, choose Complete JHA instead.";
  if (status === "draft") return null;
  return jhaCompletionIssues(assessment)[0]?.message || null;
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
