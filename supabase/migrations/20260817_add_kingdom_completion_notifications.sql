alter table public.customer_orders
  add column if not exists completion_notification_sent_at timestamptz;
