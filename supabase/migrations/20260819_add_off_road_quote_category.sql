alter table public.quotes drop constraint if exists quotes_service_category_check;
alter table public.quotes add constraint quotes_service_category_check
  check (service_category in ('passenger','tires_only','trailer_atv','off_road','truck','commercial','medium_dismount'));

