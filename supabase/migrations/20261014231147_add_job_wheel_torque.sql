-- Nullable: older jobs and delivery-only work have no recorded measurement.
-- Added to the same job row so completion and the entered value save together.
alter table public.jobs add column wheel_torque_ft_lb numeric;
alter table public.jobs add constraint jobs_wheel_torque_ft_lb_positive
  check (wheel_torque_ft_lb > 0 and wheel_torque_ft_lb < 'Infinity'::numeric);
comment on column public.jobs.wheel_torque_ft_lb is
  'Actual wheel torque entered by staff at completion, in foot-pounds; null when not recorded. Not a recommended specification.';
