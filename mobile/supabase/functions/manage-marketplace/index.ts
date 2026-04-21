// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";
import { withNotificationRouteMeta } from "../_shared/notificationRoutes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function toNumber(value: unknown): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function normalizeProductRecord(product: any) {
  if (!product) return product;

  const basePrice = toNumber(product.price ?? product.base_price) ?? 0;
  const coverImageUrl = typeof product?.cover_image_url === "string" && product.cover_image_url.trim().length > 0
    ? product.cover_image_url
    : typeof product?.primary_image === "string" && product.primary_image.trim().length > 0
      ? product.primary_image
      : null;

  return {
    ...product,
    price: basePrice,
    base_price: basePrice,
    cover_image_url: coverImageUrl,
    primary_image: coverImageUrl,
  };
}

function normalizeVariantRecord(variant: any, fallbackPrice: number) {
  if (!variant) return variant;

  const variantPrice = toNumber(variant.price ?? variant.price_override) ?? fallbackPrice;

  return {
    ...variant,
    label: variant.label ?? variant.variant_label ?? variant.sku ?? null,
    price: variantPrice,
    stock_qty: variant.stock_qty ?? variant.stock_quantity ?? null,
  };
}

function normalizeMediaRecord(media: any) {
  if (!media) return media;

  const url = typeof media?.url === "string" && media.url.trim().length > 0
    ? media.url
    : typeof media?.storage_path === "string" && media.storage_path.trim().length > 0
      ? media.storage_path
      : null;

  return {
    ...media,
    url,
  };
}

function extractAccessToken(authHeader: string): string | null {
  const trimmed = (authHeader || "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    return token || null;
  }
  return trimmed;
}

async function insertNotification(
  supabaseAdmin: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, any>;
  },
) {
  await supabaseAdmin.from("notifications").insert({
    ...payload,
    meta: withNotificationRouteMeta(payload.meta),
    read: false,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = extractAccessToken(authHeader);

    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user: authUser },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (authErr || !authUser) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const uid = authUser.id;
    const { action, ...params } = await req.json();

    // ── create_product ──────────────────────────────────────────────
    if (action === "create_product") {
      const { title, description, product_type, category, base_price, currency, group_id, is_limited_edition, limited_quantity, variants, media } = params;
      if (!title || base_price === undefined) return jsonResponse({ error: "title and base_price are required" }, 400);

      const { data: product, error: prodErr } = await supabaseAdmin
        .from("products")
        .insert({
          seller_id: uid,
          group_id: group_id || null,
          title,
          description: description || null,
          product_type: product_type || "merch",
          category: category || null,
          base_price: Number(base_price),
          currency: currency || "PHP",
          is_limited_edition: is_limited_edition || false,
          limited_quantity: limited_quantity || null,
          status: "draft",
        })
        .select()
        .single();

      if (prodErr) return jsonResponse({ error: prodErr.message }, 500);

      // Insert variants
      if (variants && Array.isArray(variants) && variants.length > 0) {
        const variantRows = variants.map((v: any) => ({
          product_id: product.id,
          variant_label: v.variant_label,
          variant_type: v.variant_type || "size",
          price_override: v.price_override || null,
          sku: v.sku || null,
          stock_quantity: v.stock_quantity || 0,
        }));
        await supabaseAdmin.from("product_variants").insert(variantRows);
      }

      // Insert media
      if (media && Array.isArray(media) && media.length > 0) {
        const mediaRows = media.map((m: any, i: number) => ({
          product_id: product.id,
          media_type: m.media_type || "image",
          storage_path: m.storage_path || m.url,
          mime_type: m.mime_type || null,
          display_order: i,
          is_primary: m.is_primary === true || i === 0,
        }));
        await supabaseAdmin.from("product_media").insert(mediaRows);
      }

      return jsonResponse({ success: true, data: normalizeProductRecord(product) });
    }

    // ── update_product ──────────────────────────────────────────────
    if (action === "update_product") {
      const { product_id, ...updates } = params;
      if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("products")
        .select("seller_id")
        .eq("id", product_id)
        .single();

      if (!existing) return jsonResponse({ error: "Product not found" }, 404);
      if (existing.seller_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const allowed = ["title", "description", "product_type", "category", "base_price", "currency", "status", "is_limited_edition", "limited_quantity"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

      const { data, error } = await supabaseAdmin
        .from("products")
        .update(patch)
        .eq("id", product_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: normalizeProductRecord(data) });
    }

    // ── publish_product ─────────────────────────────────────────────
    if (action === "publish_product") {
      const { product_id } = params;
      if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("seller_id, status")
        .eq("id", product_id)
        .single();

      if (!prod) return jsonResponse({ error: "Product not found" }, 404);
      if (prod.seller_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (prod.status !== "draft") return jsonResponse({ error: "Only draft products can be published" }, 400);

      const { data, error } = await supabaseAdmin
        .from("products")
        .update({ status: "active" })
        .eq("id", product_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: normalizeProductRecord(data) });
    }

    // ── mark_product_sold ──────────────────────────────────────────
    if (action === "mark_product_sold") {
      const { product_id } = params;
      if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("seller_id, status")
        .eq("id", product_id)
        .single();

      if (!prod) return jsonResponse({ error: "Product not found" }, 404);
      if (prod.seller_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (prod.status !== "active") {
        return jsonResponse({ error: "Only live products can be marked sold" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("products")
        .update({ status: "sold_out" })
        .eq("id", product_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: normalizeProductRecord(data) });
    }

    // ── relist_product ─────────────────────────────────────────────
    if (action === "relist_product") {
      const { product_id } = params;
      if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("seller_id, status")
        .eq("id", product_id)
        .single();

      if (!prod) return jsonResponse({ error: "Product not found" }, 404);
      if (prod.seller_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);
      if (!["sold_out", "archived"].includes(prod.status)) {
        return jsonResponse({ error: "Only sold or archived products can be relisted" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("products")
        .update({ status: "active" })
        .eq("id", product_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: normalizeProductRecord(data) });
    }

    // ── get_product_details ─────────────────────────────────────────
    if (action === "get_product_details") {
      const { product_id } = params;
      if (!product_id) return jsonResponse({ error: "product_id is required" }, 400);

      const { data: product, error: prodErr } = await supabaseAdmin
        .from("products_with_summary")
        .select("*")
        .eq("id", product_id)
        .single();

      if (prodErr || !product) return jsonResponse({ error: "Product not found" }, 404);

      const { data: variants } = await supabaseAdmin
        .from("product_variants")
        .select("*")
        .eq("product_id", product_id)
        .order("created_at");

      const { data: media } = await supabaseAdmin
        .from("product_media")
        .select("*")
        .eq("product_id", product_id)
        .order("display_order");

      const { data: shipping } = await supabaseAdmin
        .from("shipping_profiles")
        .select("*")
        .eq("seller_id", product.seller_id);

      const normalizedProduct = normalizeProductRecord(product);
      const fallbackPrice = normalizedProduct?.price ?? 0;

      return jsonResponse({
        success: true,
        data: {
          ...normalizedProduct,
          variants: (variants || []).map((variant: any) => normalizeVariantRecord(variant, fallbackPrice)),
          media: (media || []).map((item: any) => normalizeMediaRecord(item)),
          shipping_profiles: shipping || [],
        },
      });
    }

    // ── list_my_products ────────────────────────────────────────────
    if (action === "list_my_products") {
      const { data, error } = await supabaseAdmin
        .from("products_with_summary")
        .select("*")
        .eq("seller_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: (data || []).map((item: any) => normalizeProductRecord(item)) });
    }

    // ── browse_products (shop) ──────────────────────────────────────
    if (action === "browse_products") {
      const { category, product_type, seller_id, featured_only, limit: lim, offset } = params;
      const pageSize = Math.min(Number(lim) || 20, 50);
      const pageOffset = Number(offset) || 0;

      let query = supabaseAdmin
        .from("products_with_summary")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .range(pageOffset, pageOffset + pageSize - 1);

      if (category) query = query.eq("category", category);
      if (product_type) query = query.eq("product_type", product_type);
      if (seller_id) query = query.eq("seller_id", seller_id);
      if (featured_only) query = query.eq("is_featured", true);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: (data || []).map((item: any) => normalizeProductRecord(item)) });
    }

    // ── create_order (checkout) ─────────────────────────────────────
    if (action === "create_order") {
      const { items, shipping_profile_id, shipping_address, notes } = params;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return jsonResponse({ error: "items are required" }, 400);
      }

      // Validate items and compute totals
      let subtotal = 0;
      const orderItems: any[] = [];
      let sellerId: string | null = null;

      for (const item of items) {
        const { data: product } = await supabaseAdmin
          .from("products")
          .select("id, seller_id, title, base_price, status")
          .eq("id", item.product_id)
          .single();

        if (!product) return jsonResponse({ error: `Product not found: ${item.product_id}` }, 400);
        if (product.status !== "active") return jsonResponse({ error: `Product not available: ${product.title}` }, 400);
        if (product.seller_id === uid) return jsonResponse({ error: "Cannot buy your own product" }, 400);

        // All items must be from same seller
        if (!sellerId) sellerId = product.seller_id;
        if (sellerId !== product.seller_id) return jsonResponse({ error: "All items must be from the same seller" }, 400);

        let unitPrice = product.base_price;
        let variantLabel: string | null = null;

        if (item.variant_id) {
          const { data: variant } = await supabaseAdmin
            .from("product_variants")
            .select("variant_label, price_override, stock_quantity, is_available")
            .eq("id", item.variant_id)
            .single();

          if (!variant) return jsonResponse({ error: `Variant not found: ${item.variant_id}` }, 400);
          if (!variant.is_available || variant.stock_quantity < (item.quantity || 1)) {
            return jsonResponse({ error: `Variant out of stock: ${variant.variant_label}` }, 400);
          }

          if (variant.price_override !== null) unitPrice = variant.price_override;
          variantLabel = variant.variant_label;
        }

        const qty = Math.max(item.quantity || 1, 1);
        const lineTotal = unitPrice * qty;
        subtotal += lineTotal;

        orderItems.push({
          product_id: product.id,
          variant_id: item.variant_id || null,
          product_title: product.title,
          variant_label: variantLabel,
          quantity: qty,
          unit_price: unitPrice,
          line_total: lineTotal,
        });
      }

      // Get shipping fee
      let shippingFee = 0;
      if (shipping_profile_id) {
        const { data: sp } = await supabaseAdmin
          .from("shipping_profiles")
          .select("base_fee")
          .eq("id", shipping_profile_id)
          .single();
        if (sp) shippingFee = sp.base_fee || 0;
      }

      const totalAmount = subtotal + shippingFee;

      // Create order
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("orders")
        .insert({
          buyer_id: uid,
          seller_id: sellerId,
          subtotal,
          shipping_fee: shippingFee,
          total_amount: totalAmount,
          shipping_profile_id: shipping_profile_id || null,
          shipping_address: shipping_address || null,
          notes: notes || null,
          status: "pending",
        })
        .select()
        .single();

      if (orderErr) return jsonResponse({ error: orderErr.message }, 500);

      // Insert order items
      const itemRows = orderItems.map((oi) => ({ ...oi, order_id: order.id }));
      await supabaseAdmin.from("order_items").insert(itemRows);

      // Decrement stock for variants
      for (const item of items) {
        if (item.variant_id) {
          const { data: variant } = await supabaseAdmin
            .from("product_variants")
            .select("stock_quantity")
            .eq("id", item.variant_id)
            .single();
          if (variant) {
            await supabaseAdmin
              .from("product_variants")
              .update({ stock_quantity: Math.max((variant.stock_quantity || 0) - (item.quantity || 1), 0) })
              .eq("id", item.variant_id);
          }
        }
      }

      // Notify seller
      const { data: buyer } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();
      await insertNotification(supabaseAdmin, {
        user_id: sellerId!,
        type: "order",
        title: "New Order!",
        message: `${buyer?.full_name || "A buyer"} placed an order (${order.order_number})`,
        image: buyer?.avatar_url || null,
        meta: { event_type: "order_created", order_id: order.id },
      });

      return jsonResponse({ success: true, data: order });
    }

    // ── get_order_details ───────────────────────────────────────────
    if (action === "get_order_details") {
      const { order_id } = params;
      if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

      const { data: order, error: ordErr } = await supabaseAdmin
        .from("orders_with_summary")
        .select("*")
        .eq("id", order_id)
        .single();

      if (ordErr || !order) return jsonResponse({ error: "Order not found" }, 404);
      if (order.buyer_id !== uid && order.seller_id !== uid) {
        const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", uid).single();
        if (profile?.role !== "admin") return jsonResponse({ error: "Forbidden" }, 403);
      }

      const { data: items } = await supabaseAdmin
        .from("order_items")
        .select("*")
        .eq("order_id", order_id);

      const { data: fulfillments } = await supabaseAdmin
        .from("order_fulfillments")
        .select("*")
        .eq("order_id", order_id);

      return jsonResponse({
        success: true,
        data: { ...order, items: items || [], fulfillments: fulfillments || [] },
      });
    }

    // ── list_my_orders (buyer) ──────────────────────────────────────
    if (action === "list_my_orders") {
      const { data, error } = await supabaseAdmin
        .from("orders_with_summary")
        .select("*")
        .eq("buyer_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── list_seller_orders ──────────────────────────────────────────
    if (action === "list_seller_orders") {
      const { status: filterStatus } = params;
      let query = supabaseAdmin
        .from("orders_with_summary")
        .select("*")
        .eq("seller_id", uid)
        .order("created_at", { ascending: false });

      if (filterStatus) query = query.eq("status", filterStatus);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── update_order_status (seller actions) ────────────────────────
    if (action === "update_order_status") {
      const { order_id, status: newStatus } = params;
      if (!order_id || !newStatus) return jsonResponse({ error: "order_id and status are required" }, 400);

      const validTransitions: Record<string, string[]> = {
        pending: ["confirmed", "cancelled"],
        confirmed: ["processing", "cancelled"],
        processing: ["shipped", "cancelled"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: [],
        refunded: [],
        disputed: [],
      };

      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("seller_id, buyer_id, status, order_number, total_amount")
        .eq("id", order_id)
        .single();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);

      // Seller can manage, buyer can cancel pending, admin can do anything
      const isSeller = order.seller_id === uid;
      const isBuyer = order.buyer_id === uid;
      const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", uid).single();
      const isAdmin = profile?.role === "admin";

      if (!isSeller && !isBuyer && !isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
      if (isBuyer && !isSeller && !isAdmin && newStatus !== "cancelled") return jsonResponse({ error: "Buyers can only cancel orders" }, 403);

      const allowed = validTransitions[order.status];
      if (!allowed || !allowed.includes(newStatus)) {
        return jsonResponse({ error: `Cannot transition from ${order.status} to ${newStatus}` }, 400);
      }

      const updatePatch: Record<string, any> = { status: newStatus };
      if (newStatus === "confirmed") updatePatch.confirmed_at = new Date().toISOString();
      if (newStatus === "shipped") updatePatch.shipped_at = new Date().toISOString();
      if (newStatus === "delivered") updatePatch.delivered_at = new Date().toISOString();
      if (newStatus === "cancelled") updatePatch.cancelled_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from("orders")
        .update(updatePatch)
        .eq("id", order_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Notify the other party
      const notifyUserId = isSeller ? order.buyer_id : order.seller_id;
      await insertNotification(supabaseAdmin, {
        user_id: notifyUserId,
        type: "order",
        title: "Order Update",
        message: `Order ${order.order_number} status changed to ${newStatus}`,
        meta: { event_type: "order_status_updated", order_id, new_status: newStatus },
      });

      return jsonResponse({ success: true, data });
    }

    // ── create_fulfillment ──────────────────────────────────────────
    if (action === "create_fulfillment") {
      const { order_id, fulfillment_type, tracking_number, carrier, notes } = params;
      if (!order_id) return jsonResponse({ error: "order_id is required" }, 400);

      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("seller_id, buyer_id, order_number")
        .eq("id", order_id)
        .single();

      if (!order) return jsonResponse({ error: "Order not found" }, 404);
      if (order.seller_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const { data, error } = await supabaseAdmin
        .from("order_fulfillments")
        .insert({
          order_id,
          fulfillment_type: fulfillment_type || "shipment",
          tracking_number: tracking_number || null,
          carrier: carrier || null,
          notes: notes || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      await insertNotification(supabaseAdmin, {
        user_id: order.buyer_id,
        type: "order",
        title: "Fulfillment Created",
        message: `Fulfillment added for order ${order.order_number}${tracking_number ? ` - Tracking: ${tracking_number}` : ""}`,
        meta: { event_type: "fulfillment_created", order_id, fulfillment_id: data.id },
      });

      return jsonResponse({ success: true, data });
    }

    // ── update_fulfillment ──────────────────────────────────────────
    if (action === "update_fulfillment") {
      const { fulfillment_id, status: newStatus, tracking_number, carrier, notes: fNotes } = params;
      if (!fulfillment_id) return jsonResponse({ error: "fulfillment_id is required" }, 400);

      const { data: fulfillment } = await supabaseAdmin
        .from("order_fulfillments")
        .select("order_id, status")
        .eq("id", fulfillment_id)
        .single();

      if (!fulfillment) return jsonResponse({ error: "Fulfillment not found" }, 404);

      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("seller_id")
        .eq("id", fulfillment.order_id)
        .single();

      if (!order || order.seller_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      const patch: Record<string, any> = {};
      if (newStatus) {
        patch.status = newStatus;
        if (newStatus === "shipped") patch.shipped_at = new Date().toISOString();
        if (newStatus === "delivered") patch.delivered_at = new Date().toISOString();
      }
      if (tracking_number !== undefined) patch.tracking_number = tracking_number;
      if (carrier !== undefined) patch.carrier = carrier;
      if (fNotes !== undefined) patch.notes = fNotes;

      const { data, error } = await supabaseAdmin
        .from("order_fulfillments")
        .update(patch)
        .eq("id", fulfillment_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── create_shipping_profile ─────────────────────────────────────
    if (action === "create_shipping_profile") {
      const { name, shipping_type, base_fee, estimated_days_min, estimated_days_max, regions } = params;
      if (!name) return jsonResponse({ error: "name is required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("shipping_profiles")
        .insert({
          seller_id: uid,
          name,
          shipping_type: shipping_type || "standard",
          base_fee: base_fee || 0,
          estimated_days_min: estimated_days_min || 3,
          estimated_days_max: estimated_days_max || 7,
          regions: regions || ["PH"],
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── list_shipping_profiles ──────────────────────────────────────
    if (action === "list_shipping_profiles") {
      const { data, error } = await supabaseAdmin
        .from("shipping_profiles")
        .select("*")
        .eq("seller_id", uid)
        .order("created_at");

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── get_seller_dashboard ────────────────────────────────────────
    if (action === "get_seller_dashboard") {
      const { data: products } = await supabaseAdmin
        .from("products")
        .select("id, status, total_sold, base_price")
        .eq("seller_id", uid);

      const { data: orders } = await supabaseAdmin
        .from("orders")
        .select("id, status, total_amount, created_at")
        .eq("seller_id", uid)
        .order("created_at", { ascending: false });

      const activeProducts = (products || []).filter((p: any) => p.status === "active").length;
      const totalSold = (products || []).reduce((sum: number, p: any) => sum + (p.total_sold || 0), 0);
      const totalRevenue = (orders || [])
        .filter((o: any) => ["confirmed", "processing", "shipped", "delivered"].includes(o.status))
        .reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
      const pendingOrders = (orders || []).filter((o: any) => o.status === "pending").length;

      return jsonResponse({
        success: true,
        data: {
          active_products: activeProducts,
          total_products: (products || []).length,
          total_sold: totalSold,
          total_revenue: totalRevenue,
          pending_orders: pendingOrders,
          recent_orders: (orders || []).slice(0, 10),
        },
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-marketplace error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
