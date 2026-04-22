insert into storage.buckets (id, name, public)
values ('kiosk-photos', 'kiosk-photos', true)
on conflict (id) do update
set public = excluded.public;

create table if not exists public.kiosk_photos (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.kiosk_photos
add column if not exists image_to_print_url text;

alter table public.kiosk_photos enable row level security;

drop policy if exists "Anon can insert kiosk photo URLs" on public.kiosk_photos;
create policy "Anon can insert kiosk photo URLs"
on public.kiosk_photos
for insert
to anon
with check (true);

drop policy if exists "Anon can upload kiosk photos" on storage.objects;
create policy "Anon can upload kiosk photos"
on storage.objects
for insert
to anon
with check (bucket_id = 'kiosk-photos');

drop policy if exists "Anon can delete failed kiosk uploads" on storage.objects;
create policy "Anon can delete failed kiosk uploads"
on storage.objects
for delete
to anon
using (bucket_id = 'kiosk-photos');
