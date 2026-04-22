import { createClient } from '@/lib/supabase/server';
import { demoJobs } from '@/lib/mock-data';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json(demoJobs);

  const { data, error } = await supabase.from('jobs').select('*').order('scheduled_at', { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ ok: true, demoMode: true, job: body }, { status: 201 });
  }

  const { data, error } = await supabase.from('jobs').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
