-- Expand CV/resume uploads while preserving unrestricted buckets.
update storage.buckets
set allowed_mime_types = case
  when allowed_mime_types is null then null
  else (
    select array_agg(distinct mime_type order by mime_type)
    from unnest(allowed_mime_types || array[
      'application/msword',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
      'text/rtf',
      'text/plain',
      'text/markdown',
      'image/webp'
    ]::text[]) as t(mime_type)
  )
end
where id = 'documents';
