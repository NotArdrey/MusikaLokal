-- Phase 2 Workstream 6: Merchandise and Digital Marketplace
-- products, variants, media, orders, shipping, fulfillments, entitlements

-- 1. Products
CREATE TABLE public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description text CHECK (char_length(description) <= 5000),
    product_type text NOT NULL DEFAULT 'merch'
        CHECK (product_type IN ('merch', 'digital_drop', 'exclusive_content')),
    category text CHECK (category IN ('apparel', 'accessories', 'vinyl', 'cd', 'poster', 'sticker', 'digital', 'bundle', 'other')),
    base_price numeric NOT NULL CHECK (base_price >= 0),
    currency text NOT NULL DEFAULT 'PHP' CHECK (char_length(currency) = 3),
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'sold_out', 'archived', 'suspended')),
    is_featured boolean DEFAULT false,
    is_limited_edition boolean DEFAULT false,
    limited_quantity integer CHECK (limited_quantity IS NULL OR limited_quantity > 0),
    total_sold integer DEFAULT 0 CHECK (total_sold >= 0),
    average_rating numeric DEFAULT 0,
    review_count integer DEFAULT 0 CHECK (review_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_seller ON public.products(seller_id);
CREATE INDEX idx_products_group ON public.products(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_active ON public.products(created_at DESC) WHERE status = 'active';
CREATE INDEX idx_products_featured ON public.products(created_at DESC)
    WHERE is_featured = true AND status = 'active';
CREATE INDEX idx_products_type ON public.products(product_type);
CREATE INDEX idx_products_category ON public.products(category) WHERE category IS NOT NULL;

-- 2. Product Variants
CREATE TABLE public.product_variants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_label text NOT NULL CHECK (char_length(variant_label) BETWEEN 1 AND 100),
    variant_type text NOT NULL DEFAULT 'size'
        CHECK (variant_type IN ('size', 'color', 'format', 'edition', 'other')),
    price_override numeric CHECK (price_override IS NULL OR price_override >= 0),
    sku text CHECK (char_length(sku) <= 50),
    stock_quantity integer DEFAULT 0 CHECK (stock_quantity >= 0),
    is_available boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_variants_product ON public.product_variants(product_id);
CREATE INDEX idx_product_variants_available ON public.product_variants(product_id)
    WHERE is_available = true AND stock_quantity > 0;

-- 3. Product Media
CREATE TABLE public.product_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    media_type text NOT NULL DEFAULT 'image'
        CHECK (media_type IN ('image', 'video', 'promo_clip')),
    storage_path text NOT NULL,
    mime_type text,
    display_order integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_media_product ON public.product_media(product_id);

-- 4. Shipping Profiles
CREATE TABLE public.shipping_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
    shipping_type text NOT NULL DEFAULT 'standard'
        CHECK (shipping_type IN ('standard', 'express', 'pickup', 'digital')),
    base_fee numeric DEFAULT 0 CHECK (base_fee >= 0),
    currency text NOT NULL DEFAULT 'PHP',
    estimated_days_min integer DEFAULT 3,
    estimated_days_max integer DEFAULT 7,
    regions text[] DEFAULT ARRAY['PH'],
    is_default boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipping_profiles_seller ON public.shipping_profiles(seller_id);

-- 5. Orders
CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_number text UNIQUE NOT NULL DEFAULT ('ORD-' || upper(substr(gen_random_uuid()::text, 1, 8))),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'disputed')),
    subtotal numeric NOT NULL CHECK (subtotal >= 0),
    shipping_fee numeric DEFAULT 0 CHECK (shipping_fee >= 0),
    total_amount numeric NOT NULL CHECK (total_amount >= 0),
    currency text NOT NULL DEFAULT 'PHP',
    shipping_profile_id uuid REFERENCES public.shipping_profiles(id) ON DELETE SET NULL,
    shipping_address jsonb,
    payment_reference text,
    wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
    notes text CHECK (char_length(notes) <= 1000),
    confirmed_at timestamptz,
    shipped_at timestamptz,
    delivered_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_buyer ON public.orders(buyer_id);
CREATE INDEX idx_orders_seller ON public.orders(seller_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_number ON public.orders(order_number);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);

-- 6. Order Items (snapshot price at purchase)
CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
    product_title text NOT NULL,
    variant_label text,
    quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price numeric NOT NULL CHECK (unit_price >= 0),
    line_total numeric NOT NULL CHECK (line_total >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_product ON public.order_items(product_id);

-- 7. Order Fulfillments
CREATE TABLE public.order_fulfillments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    fulfillment_type text NOT NULL DEFAULT 'shipment'
        CHECK (fulfillment_type IN ('shipment', 'digital_release', 'pickup')),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'preparing', 'shipped', 'in_transit', 'delivered', 'failed', 'returned')),
    tracking_number text CHECK (char_length(tracking_number) <= 100),
    carrier text CHECK (char_length(carrier) <= 100),
    shipped_at timestamptz,
    delivered_at timestamptz,
    notes text CHECK (char_length(notes) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fulfillments_order ON public.order_fulfillments(order_id);
CREATE INDEX idx_fulfillments_status ON public.order_fulfillments(status);

-- 8. User Entitlements (reserved for future digital drops)
CREATE TABLE public.user_entitlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    entitlement_type text NOT NULL CHECK (entitlement_type IN ('exclusive_song', 'exclusive_playlist', 'premium_content', 'merch_access')),
    resource_id uuid NOT NULL,
    resource_type text NOT NULL CHECK (resource_type IN ('playlist', 'product', 'station')),
    granted_by text NOT NULL DEFAULT 'purchase'
        CHECK (granted_by IN ('purchase', 'promotion', 'subscription', 'gift')),
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    expires_at timestamptz,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_entitlements_user ON public.user_entitlements(user_id);
CREATE INDEX idx_entitlements_resource ON public.user_entitlements(resource_type, resource_id);
CREATE INDEX idx_entitlements_active ON public.user_entitlements(user_id)
    WHERE is_active = true;

-- Add FK from feed_posts.linked_product_id
ALTER TABLE public.feed_posts
    ADD CONSTRAINT fk_feed_posts_linked_product
    FOREIGN KEY (linked_product_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Triggers
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fulfillments_updated_at
    BEFORE UPDATE ON public.order_fulfillments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seller products view
CREATE OR REPLACE VIEW public.products_with_summary AS
SELECT
    p.*,
    pr.full_name AS seller_name,
    pr.avatar_url AS seller_avatar,
    g.name AS group_name,
    (SELECT count(*) FROM public.product_variants pv WHERE pv.product_id = p.id AND pv.is_available = true AND pv.stock_quantity > 0) AS available_variants,
    (SELECT coalesce(sum(pv.stock_quantity), 0) FROM public.product_variants pv WHERE pv.product_id = p.id) AS total_stock,
    (SELECT pm2.storage_path FROM public.product_media pm2 WHERE pm2.product_id = p.id AND pm2.is_primary = true LIMIT 1) AS primary_image
FROM public.products p
JOIN public.profiles pr ON pr.id = p.seller_id
LEFT JOIN public.groups g ON g.id = p.group_id;

-- Order summary view
CREATE OR REPLACE VIEW public.orders_with_summary AS
SELECT
    o.*,
    bp.full_name AS buyer_name,
    bp.avatar_url AS buyer_avatar,
    sp.full_name AS seller_name,
    (SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count,
    (SELECT coalesce(sum(oi.quantity), 0) FROM public.order_items oi WHERE oi.order_id = o.id) AS total_quantity
FROM public.orders o
JOIN public.profiles bp ON bp.id = o.buyer_id
JOIN public.profiles sp ON sp.id = o.seller_id;

-- RLS Policies

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- Products: public read for active, seller full access
CREATE POLICY products_select ON public.products
    FOR SELECT USING (
        status = 'active'
        OR seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY products_insert ON public.products
    FOR INSERT WITH CHECK (seller_id = auth.uid());

CREATE POLICY products_update ON public.products
    FOR UPDATE USING (
        seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY products_delete ON public.products
    FOR DELETE USING (seller_id = auth.uid());

-- Product Variants
CREATE POLICY product_variants_select ON public.product_variants
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id
            AND (p.status = 'active' OR p.seller_id = auth.uid()
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')))
    );

CREATE POLICY product_variants_insert ON public.product_variants
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.seller_id = auth.uid())
    );

CREATE POLICY product_variants_update ON public.product_variants
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.seller_id = auth.uid())
    );

CREATE POLICY product_variants_delete ON public.product_variants
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND p.seller_id = auth.uid())
    );

-- Product Media
CREATE POLICY product_media_select ON public.product_media
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_media.product_id
            AND (p.status = 'active' OR p.seller_id = auth.uid()))
    );

CREATE POLICY product_media_insert ON public.product_media
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.seller_id = auth.uid())
    );

CREATE POLICY product_media_delete ON public.product_media
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_media.product_id AND p.seller_id = auth.uid())
    );

-- Shipping Profiles
CREATE POLICY shipping_profiles_select ON public.shipping_profiles
    FOR SELECT USING (
        seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY shipping_profiles_insert ON public.shipping_profiles
    FOR INSERT WITH CHECK (seller_id = auth.uid());

CREATE POLICY shipping_profiles_update ON public.shipping_profiles
    FOR UPDATE USING (seller_id = auth.uid());

CREATE POLICY shipping_profiles_delete ON public.shipping_profiles
    FOR DELETE USING (seller_id = auth.uid());

-- Orders: buyer + seller can see their orders
CREATE POLICY orders_select ON public.orders
    FOR SELECT USING (
        buyer_id = auth.uid()
        OR seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY orders_insert ON public.orders
    FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY orders_update ON public.orders
    FOR UPDATE USING (
        buyer_id = auth.uid()
        OR seller_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Order Items: visible with order
CREATE POLICY order_items_select ON public.order_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id
            AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')))
    );

CREATE POLICY order_items_insert ON public.order_items
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid())
    );

-- Fulfillments: visible with order
CREATE POLICY fulfillments_select ON public.order_fulfillments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_fulfillments.order_id
            AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid()
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')))
    );

CREATE POLICY fulfillments_insert ON public.order_fulfillments
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_fulfillments.order_id AND o.seller_id = auth.uid())
    );

CREATE POLICY fulfillments_update ON public.order_fulfillments
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_fulfillments.order_id AND o.seller_id = auth.uid())
    );

-- Entitlements
CREATE POLICY entitlements_select ON public.user_entitlements
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY entitlements_insert ON public.user_entitlements
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
