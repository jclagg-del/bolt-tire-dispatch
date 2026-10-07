import { NextResponse } from "next/server";
import { jhaAccess, jhaUnavailable } from "@/lib/job-jha-server";
import { isDeliveryService } from "@/lib/job-completion";
import { jhaContext, jhaReady, jhaValidation, normalizeJha, type JhaStatus } from "@/lib/job-jha";

type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const access = await jhaAccess(request, id);
  if (access.error) return access.error;
  const { admin, job } = access;
  const revision = new URL(request.url).searchParams.get("revision");
  if (revision && !/^[1-9]\d{0,8}$/.test(revision)) return NextResponse.json({ error: "Invalid revision." }, { status: 400 });
  // Use the persisted service type, not a client-provided exemption. Delivery
  // completion does not depend on an assessment or JHA storage being available.
  if (!revision && isDeliveryService(job.service_type)) {
    return NextResponse.json({ job, record: null, context: jhaContext(job), required: false,
      ready: true, readOnly: true, history: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  let query = admin.from(revision ? "job_jha_history" : "job_jhas").select("*").eq("job_id", id);
  if (revision) query = query.eq("revision", Number(revision));
  const [{ data: record, error }, { data: history, error: historyError }] = await Promise.all([
    query.maybeSingle(),
    admin.from("job_jha_history").select("revision,status,updated_at,completed_at").eq("job_id", id).order("revision", { ascending: false }).limit(50),
  ]);
  if (error || historyError) return jhaUnavailable();
  if (revision && !record) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
  if (record) {
    const assessment = normalizeJha(record.assessment);
    const photos = await Promise.all(assessment.photos.map(async photo => {
      const { data } = await admin.storage.from("job-jha-photos").createSignedUrl(photo.path, 900);
      return { ...photo, url: data?.signedUrl || "" };
    }));
    record.assessment = { ...assessment, photos };
  }
  return NextResponse.json({ job, record, context: jhaContext(job), required: !isDeliveryService(job.service_type), ready: !revision && jhaReady(record, job),
    readOnly: !!revision || !!job.complete || !!job.archived, history: history || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const access = await jhaAccess(request, id);
  if (access.error) return access.error;
  const { admin, user, job } = access;
  if (job.complete || job.archived) return NextResponse.json({ error: "Reopen this job before changing its JHA." }, { status: 409 });
  const raw = await request.text();
  if (raw.length > 160000) return NextResponse.json({ error: "Assessment is too large." }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid assessment." }, { status: 400 }); }
  if (!body || !["draft", "complete", "unsafe"].includes(body.status) || !Number.isInteger(body.revision) || body.revision < 0 || !body.context) return NextResponse.json({ error: "Invalid assessment revision or status." }, { status: 400 });
  if ((body.assessment?.photos?.length || 0) > 12 || (body.assessment?.steps?.length || 0) > 20) return NextResponse.json({ error: "Maximum 12 photos and 20 steps per assessment." }, { status: 400 });
  const assessment = normalizeJha(body.assessment);
  const validation = jhaValidation(assessment, body.status as JhaStatus);
  if (validation) return NextResponse.json({ error: validation }, { status: 400 });
  // Database RPC serializes with completion, checks the revision, job context,
  // attachment ownership and completion requirements, and records server time.
  const { data, error } = await admin.rpc("save_job_jha", { p_job_id: id, p_revision: body.revision,
    p_status: body.status, p_assessment: assessment, p_user: user.id, p_context: body.context });
  if (error) {
    if (["42883", "42P01", "PGRST202"].includes(error.code || "")) return jhaUnavailable();
    return NextResponse.json({ error: error.code === "P0001" ? error.message : "The JHA was not saved. Reload and try again." }, { status: 409 });
  }
  return NextResponse.json({ record: data }, { headers: { "Cache-Control": "no-store" } });
}
