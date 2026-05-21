-- Keep audit card titles as entity labels, not private message/request text or raw UUIDs.
CREATE OR REPLACE FUNCTION public.audit_entity_label(p_table text, p_row jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  key text;
  value text;
  normalized_table text := lower(btrim(coalesce(p_table, '')));
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  CASE normalized_table
    WHEN 'booking_requests' THEN RETURN 'Booking request';
    WHEN 'conversations' THEN RETURN 'Conversation';
    WHEN 'conversation_participants' THEN RETURN 'Conversation participant';
    WHEN 'messages' THEN RETURN 'Message';
    WHEN 'message_reactions' THEN RETURN 'Message reaction';
    WHEN 'post_comments' THEN RETURN 'Post comment';
    WHEN 'post_reactions' THEN RETURN 'Post reaction';
    ELSE
      NULL;
  END CASE;

  FOREACH key IN ARRAY ARRAY[
    'name',
    'title',
    'full_name',
    'display_name',
    'business_name',
    'order_number',
    'reference_number',
    'subject',
    'recipient_email',
    'email'
  ] LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      RETURN left(value, 180);
    END IF;
  END LOOP;

  RETURN initcap(replace(coalesce(nullif(normalized_table, ''), 'record'), '_', ' '));
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_entity_label(text, jsonb) FROM PUBLIC, anon, authenticated;
