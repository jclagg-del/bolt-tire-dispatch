alter table public.jobs
  add column if not exists review_request_sent_at timestamptz,
  add column if not exists review_request_message_id text;
