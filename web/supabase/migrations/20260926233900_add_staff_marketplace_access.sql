-- Let explicitly authorized staff manage the marketplace of the owner behind
-- their assigned studio, gig, or production team.

ALTER TABLE public.staff_listing_access
  ADD COLUMN IF NOT EXISTS can_manage_marketplace boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS staff_listing_access_marketplace_active_idx
  ON public.staff_listing_access(staff_user_id)
  WHERE revoked_at IS NULL AND can_manage_marketplace = true;
CREATE OR REPLACE FUNCTION public.staff_marketplace_owner_ids(p_user_id uuid)
RETURNS TABLE(owner_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT owners.owner_id
  FROM (
    SELECT s.owner_id
    FROM public.staff_listing_access sla
    JOIN public.studios s ON s.id = sla.studio_id
    WHERE sla.staff_user_id = p_user_id
      AND sla.entity_type = 'studio'
      AND sla.can_manage_marketplace = true
      AND sla.revoked_at IS NULL

    UNION ALL

    SELECT g.organizer_id
    FROM public.staff_listing_access sla
    JOIN public.gigs g ON g.id = sla.gig_id
    WHERE sla.staff_user_id = p_user_id
      AND sla.entity_type = 'venue'
      AND sla.can_manage_marketplace = true
      AND sla.revoked_at IS NULL

    UNION ALL

    SELECT pt.owner_id
    FROM public.staff_listing_access sla
    JOIN public.production_teams pt ON pt.id = sla.production_team_id
    WHERE sla.staff_user_id = p_user_id
      AND sla.entity_type = 'production'
      AND sla.can_manage_marketplace = true
      AND sla.revoked_at IS NULL
  ) owners
  WHERE owners.owner_id IS NOT NULL;
$function$;
CREATE OR REPLACE FUNCTION public.staff_can_manage_marketplace_for(p_user_id uuid, p_seller_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_marketplace_owner_ids(p_user_id) owner
    WHERE owner.owner_id = p_seller_id
  );
$function$;
GRANT EXECUTE ON FUNCTION public.staff_marketplace_owner_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_marketplace_for(uuid, uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS staff_marketplace_products_insert ON public.products;
CREATE POLICY staff_marketplace_products_insert ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_manage_marketplace_for(auth.uid(), seller_id));
DROP POLICY IF EXISTS staff_marketplace_products_update ON public.products;
CREATE POLICY staff_marketplace_products_update ON public.products
  FOR UPDATE TO authenticated
  USING (public.staff_can_manage_marketplace_for(auth.uid(), seller_id))
  WITH CHECK (public.staff_can_manage_marketplace_for(auth.uid(), seller_id));
DROP POLICY IF EXISTS staff_marketplace_products_delete ON public.products;
CREATE POLICY staff_marketplace_products_delete ON public.products
  FOR DELETE TO authenticated
  USING (public.staff_can_manage_marketplace_for(auth.uid(), seller_id));
DROP POLICY IF EXISTS staff_marketplace_product_variants_manage ON public.product_variants;
CREATE POLICY staff_marketplace_product_variants_manage ON public.product_variants
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), p.seller_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), p.seller_id)
  ));
DROP POLICY IF EXISTS staff_marketplace_product_media_manage ON public.product_media;
CREATE POLICY staff_marketplace_product_media_manage ON public.product_media
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_media.product_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), p.seller_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_media.product_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), p.seller_id)
  ));
DROP POLICY IF EXISTS staff_marketplace_shipping_profiles_manage ON public.shipping_profiles;
CREATE POLICY staff_marketplace_shipping_profiles_manage ON public.shipping_profiles
  FOR ALL TO authenticated
  USING (public.staff_can_manage_marketplace_for(auth.uid(), seller_id))
  WITH CHECK (public.staff_can_manage_marketplace_for(auth.uid(), seller_id));
DROP POLICY IF EXISTS staff_marketplace_orders_select ON public.orders;
CREATE POLICY staff_marketplace_orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.staff_can_manage_marketplace_for(auth.uid(), seller_id));
DROP POLICY IF EXISTS staff_marketplace_orders_update ON public.orders;
CREATE POLICY staff_marketplace_orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING (public.staff_can_manage_marketplace_for(auth.uid(), seller_id))
  WITH CHECK (public.staff_can_manage_marketplace_for(auth.uid(), seller_id));
DROP POLICY IF EXISTS staff_marketplace_order_items_select ON public.order_items;
CREATE POLICY staff_marketplace_order_items_select ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), o.seller_id)
  ));
DROP POLICY IF EXISTS staff_marketplace_fulfillments_manage ON public.order_fulfillments;
CREATE POLICY staff_marketplace_fulfillments_manage ON public.order_fulfillments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_fulfillments.order_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), o.seller_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_fulfillments.order_id
      AND public.staff_can_manage_marketplace_for(auth.uid(), o.seller_id)
  ));
