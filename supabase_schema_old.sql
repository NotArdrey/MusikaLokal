-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles (public user data, linked to auth.users)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text check (role in ('manager', 'musician-member', 'studio-owner', 'venue-owner')),
  bio text,
  location text,
  skills text[], -- Array of instruments/roles (Drummer, Vocalist, etc.)
  genres text[], -- Array of music genres (Rock, Indie, etc.)
  rating numeric default 0,
  review_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Groups (Bands/Artists)
create table groups (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  genre text,
  description text,
  members jsonb, -- Array of member names or details
  location text,
  rating numeric default 0,
  review_count integer default 0,
  images text[], -- Array of image URLs
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Studios
create table studios (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  address text,
  hourly_rate numeric,
  description text,
  amenities text[], -- Array of amenities
  rating numeric default 0,
  review_count integer default 0,
  images text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Gigs
create table gigs (
  id uuid default uuid_generate_v4() primary key,
  organizer_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  location text,
  budget numeric,
  description text,
  event_date timestamp with time zone,
  requirements jsonb, -- JSON object for specific filters
  images text[], -- Gallery images
  documents text[], -- Contract, Rider documents
  status text default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Reviews (Polymorphic-style via nullable FKs)
create table reviews (
  id uuid default uuid_generate_v4() primary key,
  author_id uuid references profiles(id) on delete cascade not null,
  -- Target Entities (Only one should be set)
  group_id uuid references groups(id) on delete cascade,
  studio_id uuid references studios(id) on delete cascade,
  gig_id uuid references gigs(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade, -- For reviewing users directly
  
  rating integer check (rating >= 1 and rating <= 5) not null,
  content text,
  likes_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint one_target_only check (
    (group_id is not null)::int +
    (studio_id is not null)::int +
    (gig_id is not null)::int +
    (user_id is not null)::int = 1
  )
);

-- 6. Favorites (Likes/Bookmarks for Pages)
create table favorites (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  group_id uuid references groups(id) on delete cascade,
  studio_id uuid references studios(id) on delete cascade,
  gig_id uuid references gigs(id) on delete cascade,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint fav_one_target check (
    (group_id is not null)::int +
    (studio_id is not null)::int +
    (gig_id is not null)::int = 1
  )
);

-- 7. Review Likes (Hearting a review)
create table review_likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  review_id uuid references reviews(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, review_id)
);

-- 8. Review Comments (Replying to a review)
create table review_comments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  review_id uuid references reviews(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Reports
create table reports (
  id uuid default uuid_generate_v4() primary key,
  reporter_id uuid references profiles(id) on delete set null,
  target_type text not null, -- 'group', 'studio', 'gig', 'user'
  target_id uuid not null, -- ID of the reported entity
  reason text not null,
  details text,
  status text default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 10. Studio Bookings
create table studio_bookings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  studio_id uuid references studios(id) on delete cascade not null,
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  duration_hours numeric,
  total_cost numeric,
  notes text,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 11. Gig Applications
create table gig_applications (
  id uuid default uuid_generate_v4() primary key,
  applicant_id uuid references profiles(id) on delete cascade not null,
  group_id uuid references groups(id) on delete cascade, -- If applying as a group
  gig_id uuid references gigs(id) on delete cascade not null,
  pitch_message text,
  video_url text, -- Demo video link
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security (RLS) Basics
alter table profiles enable row level security;
alter table groups enable row level security;
alter table studios enable row level security;
alter table gigs enable row level security;
alter table reviews enable row level security;

-- Example Policy: Profiles are viewable by everyone
create policy "Public profiles are viewable by everyone"
  on profiles for select
  using ( true );

-- Example Policy: Users can insert their own profile
create policy "Users can insert their own profile"
  on profiles for insert
  with check ( auth.uid() = id );

-- Example Policy: Updates only by owner
create policy "Users can update own profile"
  on profiles for update
  using ( auth.uid() = id );


ALTER TABLE profiles ADD COLUMN IF NOT EXISTS portfolio_urls text[];

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- BUCKET: portfolio (User media/videos)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('portfolio', 'portfolio', true)
ON CONFLICT (id) DO NOTHING;

-- BUCKET: listings (Groups/Studios/Gigs images)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('listings', 'listings', true)
ON CONFLICT (id) DO NOTHING;

-- BUCKET: documents (Private contracts/riders)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to avatars bucket
CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
-- Allow public read access to avatars
CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');
-- Allow authenticated users to upload to portfolio bucket
CREATE POLICY "Users can upload portfolio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'portfolio' AND auth.uid()::text = (storage.foldername(name))[1]);
-- Allow public read access to portfolio
CREATE POLICY "Portfolio is publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'portfolio');
-- Allow authenticated users to upload to listings bucket
CREATE POLICY "Users can upload listings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'listings');
-- Allow public read access to listings
CREATE POLICY "Listings are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'listings');


create table notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  type text check (type in ('success', 'info', 'warning', 'error')),
  title text not null,
  message text not null,
  read boolean default false,
  image text, 
  meta jsonb, 
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table notifications enable row level security;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);





alter table favorites enable row level security;
create policy "Users can view own favorites" on favorites for select to authenticated using (auth.uid() = user_id);
create policy "Users can insert own favorites" on favorites for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can delete own favorites" on favorites for delete to authenticated using (auth.uid() = user_id);







-- Reports
alter table reports enable row level security;
create policy "Users can insert reports" on reports for insert to authenticated with check (auth.uid() = reporter_id);
create policy "Users can view own reports" on reports for select to authenticated using (auth.uid() = reporter_id);

-- Review Likes
alter table review_likes enable row level security;
create policy "Review likes are public" on review_likes for select to public using (true);
create policy "Users can toggle review likes" on review_likes for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can remove review likes" on review_likes for delete to authenticated using (auth.uid() = user_id);

-- Review Comments
alter table review_comments enable row level security;
create policy "Review comments are public" on review_comments for select to public using (true);
create policy "Users can post review comments" on review_comments for insert to authenticated with check (auth.uid() = user_id);


-- Add is_verified column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;

create extension if not exists pg_cron;

SELECT cron.schedule(
  'cleanup-ghost-accounts', -- Job Name
  '0 0 * * *',              -- Schedule (Midnight)
  $$SELECT delete_old_unverified_users()$$ -- Command to run
);


-- Create pending_signups table for storing credentials before verification
-- Run this in Supabase Dashboard > SQL Editor

CREATE TABLE pending_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '1 hour'
);

-- Enable RLS
ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for signup before auth)
CREATE POLICY "Allow anonymous insert" ON pending_signups
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow service role full access (for webhook to read and delete)
CREATE POLICY "Service role full access" ON pending_signups
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_pending_signups_email ON pending_signups(email);

-- Auto-cleanup expired signups (optional: run as scheduled function)
-- DELETE FROM pending_signups WHERE expires_at < now();
-- Drop the existing policy
DROP POLICY IF EXISTS "Allow anonymous insert" ON pending_signups;

-- Create a policy that allows ALL roles to insert (including anon)
CREATE POLICY "Allow anonymous insert" ON pending_signups
  FOR INSERT
  WITH CHECK (true);

  -- Drop existing policies
DROP POLICY IF EXISTS "Allow anonymous insert" ON pending_signups;
DROP POLICY IF EXISTS "Service role full access" ON pending_signups;

-- Allow anyone to insert
CREATE POLICY "Allow insert" ON pending_signups
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to select their just-inserted row (needed for .select() after insert)
CREATE POLICY "Allow select" ON pending_signups
  FOR SELECT
  USING (true);

-- Allow service role to delete
CREATE POLICY "Service role delete" ON pending_signups
  FOR DELETE
  USING (true);


ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS id_document_expiry date,
ADD COLUMN IF NOT EXISTS id_verified_at timestamp with time zone;


ALTER TABLE pending_signups ADD COLUMN IF NOT EXISTS didit_session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pending_signups_session ON pending_signups(didit_session_id);