import { NextResponse } from "next/server";
import { jhaAccess, jhaUnavailable } from "@/lib/job-jha-server";
import { jhaImageType, JHA_MAX_PHOTO_BYTES } from "@/lib/job-jha";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await jhaAccess(request, id);
  if (access.error) return access.error;
  const { admin, user, job } = access;
  if (job.complete || job.archived) return NextResponse.json({ error: "This job is read-only." }, { status: 409 });
  if (Number(request.headers.get("content-length") || 0) > JHA_MAX_PHOTO_BYTES + 32768) return NextResponse.json({ error: "Photo is too large." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0 || photo.size > JHA_MAX_PHOTO_BYTES) return NextResponse.json({ error: "Choose a photo no larger than 3 MB." }, { status: 400 });
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const type = jhaImageType(bytes);
  if (!type) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
  const path = `${id}/${user.id}/${crypto.randomUUID()}.${type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp"}`;
  const { error } = await admin.storage.from("job-jha-photos").upload(path, bytes, { contentType: type, upsert: false });
  if (error) return jhaUnavailable();
  const { error: recordError } = await admin.from("job_jha_photos").insert({ path, job_id: id, uploaded_by: user.id });
  if (recordError) {
    await admin.storage.from("job-jha-photos").remove([path]);
    return jhaUnavailable();
  }
  const { data } = await admin.storage.from("job-jha-photos").createSignedUrl(path, 900);
  return NextResponse.json({ photo: { path, caption: "", category: "Before work", url: data?.signedUrl || "" } }, { headers: { "Cache-Control": "no-store" } });
}
