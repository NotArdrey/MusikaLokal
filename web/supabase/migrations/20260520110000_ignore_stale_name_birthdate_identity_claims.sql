do $$
declare
  v_definition text;
  v_stale_name_match_lookup text := 'from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.normalized_full_legal_name = v_normalized_name';
  v_active_name_match_lookup text := 'from public.identity_document_claims c
    join public.profiles p on p.id = c.user_id
    where c.normalized_full_legal_name = v_normalized_name';
begin
  select pg_get_functiondef(
    'public.claim_identity_document_approval_v2(uuid,text,text,text,text,text,text,text,text,date,text,text,uuid,jsonb,boolean)'::regprocedure
  )
  into v_definition;

  if v_definition is null then
    raise exception 'claim_identity_document_approval_v2 is missing';
  end if;

  if position(v_active_name_match_lookup in v_definition) > 0 then
    return;
  end if;

  if position(v_stale_name_match_lookup in v_definition) = 0 then
    raise exception 'claim_identity_document_approval_v2 name/birthdate lookup did not match expected definition';
  end if;

  execute replace(v_definition, v_stale_name_match_lookup, v_active_name_match_lookup);
end;
$$;

comment on function public.claim_identity_document_approval_v2(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  uuid,
  jsonb,
  boolean
) is 'Approves identity claims. Name/birthdate duplicate review only counts claims with active profiles; deleted-profile claims remain for document-fingerprint audit checks.';
