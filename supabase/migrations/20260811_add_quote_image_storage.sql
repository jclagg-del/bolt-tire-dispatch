insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-images', 'quote-images', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create policy "Authenticated staff upload quote images" on storage.objects for insert to authenticated with check (bucket_id='quote-images');
create policy "Public quote images can be viewed" on storage.objects for select to public using (bucket_id='quote-images');
create policy "Authenticated staff update quote images" on storage.objects for update to authenticated using (bucket_id='quote-images') with check (bucket_id='quote-images');
create policy "Authenticated staff delete quote images" on storage.objects for delete to authenticated using (bucket_id='quote-images');
