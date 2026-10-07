begin;

-- Inserts hold KEY SHARE locks for the profile foreign key. A NO KEY UPDATE
-- lock still serializes reservations, while allowing those FK checks to finish.
do $$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.enforce_studio_payment_eligibility()',
    'public.create_studio_reservation_batch(uuid,jsonb)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_definition := replace(v_definition, 'where id = v_user for update', 'where id = v_user for no key update');
    v_definition := replace(v_definition, 'where id = p_user_id for update', 'where id = p_user_id for no key update');
    execute v_definition;
  end loop;
end;
$$;

commit;
