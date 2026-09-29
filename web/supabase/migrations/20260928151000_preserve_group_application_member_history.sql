begin;

alter table public.gig_application_members
  alter column user_id drop not null;

alter table public.gig_application_members
  drop constraint if exists gig_application_members_user_id_fkey;

alter table public.gig_application_members
  add constraint gig_application_members_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

comment on column public.gig_application_members.user_id is
  'Linked member profile. Set to null when an account is deleted so the historical application remains intact.';

commit;
