-- Notifications must remain private to their recipient account.
-- This migration is intentionally idempotent so it can repair drift safely.

alter table public.notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
on public.notifications
as permissive
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own notifications" on public.notifications;
create policy "Users can insert own notifications"
on public.notifications
as permissive
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications
as permissive
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists idx_notifications_user_created_desc
on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread_created_desc
on public.notifications (user_id, created_at desc)
where read = false;
