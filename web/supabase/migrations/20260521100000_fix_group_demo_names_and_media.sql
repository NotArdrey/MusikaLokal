-- Keep demo group listings branded as groups, not individual performers.
-- Also ensures group listings have group-performance images.

DO $$
DECLARE
  v_jazz_group_id uuid := '30000000-0000-4000-8000-000000000002';
  v_jazz_group_image text := 'https://images.pexels.com/photos/9419244/pexels-photo-9419244.jpeg?auto=compress&cs=tinysrgb&w=1200';
BEGIN
  UPDATE public.groups
  SET
    name = 'Baliwag Jazz Collective',
    description = 'Lounge-ready Bulacan soul and jazz collective with Tagalog standards, bossa sets, and quiet-dinner arrangements.'
  WHERE id = v_jazz_group_id
     OR name = 'Mara Reyes Quartet';

  UPDATE public.group_media
  SET media_url = v_jazz_group_image
  WHERE group_id = v_jazz_group_id
    AND sort_order = 0;

  INSERT INTO public.group_media (group_id, media_type, media_url, sort_order)
  SELECT v_jazz_group_id, 'image', v_jazz_group_image, 0
  WHERE EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = v_jazz_group_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.group_media
    WHERE group_id = v_jazz_group_id
      AND sort_order = 0
  )
  ON CONFLICT (group_id, media_type, media_url) DO UPDATE
  SET sort_order = excluded.sort_order;

  UPDATE public.products
  SET
    title = replace(replace(title, 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Mara Reyes Lyric Zine', 'Baliwag Jazz Collective Lyric Zine'),
    description = replace(description, 'Mara Reyes Quartet', 'Baliwag Jazz Collective')
  WHERE group_id = v_jazz_group_id;

  UPDATE public.product_variants
  SET sku = replace(replace(sku, 'MRQ-', 'BJC-'), 'MR-', 'BJC-')
  WHERE product_id IN (
    SELECT id
    FROM public.products
    WHERE group_id = v_jazz_group_id
  );

  UPDATE public.playlist_items
  SET artist_name = 'Baliwag Jazz Collective'
  WHERE artist_name = 'Mara Reyes Quartet';

  UPDATE public.gig_applications
  SET
    pitch_message = replace(pitch_message, 'Mara Reyes Quartet', 'Baliwag Jazz Collective'),
    note = replace(note, 'Mara Reyes Quartet', 'Baliwag Jazz Collective')
  WHERE group_id = v_jazz_group_id
     OR pitch_message ILIKE '%Mara Reyes Quartet%'
     OR note ILIKE '%Mara Reyes Quartet%';

  UPDATE public.gig_applications
  SET performer_snapshot = replace(performer_snapshot::text, 'Mara Reyes Quartet', 'Baliwag Jazz Collective')::jsonb
  WHERE performer_snapshot::text ILIKE '%Mara Reyes Quartet%';
END $$;

INSERT INTO public.group_media (group_id, media_type, media_url, sort_order)
SELECT g.id, 'image', seed.media_url, 0
FROM (
  VALUES
    ('f0000000-0000-4000-8000-000000000302'::uuid, 'Bulacan Indie Circuit', 'https://images.pexels.com/photos/2601186/pexels-photo-2601186.jpeg?auto=compress&cs=tinysrgb&w=1200'),
    ('f0000000-0000-4000-8000-000000000301'::uuid, 'Bulacan Session Club', 'https://images.pexels.com/photos/7502581/pexels-photo-7502581.jpeg?auto=compress&cs=tinysrgb&w=1200')
) AS seed(group_id, group_name, media_url)
JOIN public.groups g
  ON g.id = seed.group_id
  OR g.name = seed.group_name
WHERE NOT EXISTS (
  SELECT 1
  FROM public.group_media gm
  WHERE gm.group_id = g.id
)
ON CONFLICT (group_id, media_type, media_url) DO UPDATE
SET sort_order = excluded.sort_order;
