import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

type StorageRef = {
  bucket: string;
  path: string;
};

const parseStorageRef = (rawUrl: string): StorageRef | null => {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const parsePath = (pathname: string) => {
    const match = pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
    );
    if (!match) return null;
    const bucket = decodeURIComponent(match[1] || "").trim();
    const path = decodeURIComponent(match[2] || "").trim();
    if (!bucket || !path) return null;
    return { bucket, path };
  };

  try {
    const parsed = new URL(trimmed);
    return parsePath(parsed.pathname);
  } catch {
    if (trimmed.startsWith("/storage/v1/object/")) {
      return parsePath(trimmed);
    }
    return null;
  }
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase environment variables" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const body = await req.json().catch(() => ({}));
    const studioId = typeof body?.studioId === "string" ? body.studioId : "";
    const reason =
      typeof body?.reason === "string" && body.reason.trim().length > 0
        ? body.reason.trim()
        : "Deleted from My Studio screen by owner";

    if (!studioId) {
      return new Response(
        JSON.stringify({ error: "studioId is required", success: false }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    const { data: studio, error: studioError } = await userClient
      .from("studios")
      .select("id, owner_id, contract_url, business_permit_url")
      .eq("id", studioId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (studioError) {
      throw studioError;
    }

    if (!studio) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "STUDIO_NOT_FOUND",
          message: "Studio not found.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const { data: mediaRows, error: mediaError } = await userClient
      .from("studio_media")
      .select("media_url")
      .eq("studio_id", studioId)
      .eq("media_type", "image");

    if (mediaError) {
      throw mediaError;
    }

    const urls: string[] = [
      ...(mediaRows || []).map((row: any) => row?.media_url).filter(Boolean),
      studio.contract_url,
      studio.business_permit_url,
    ].filter(Boolean);

    const { data: deleteResult, error: deleteError } = await userClient.rpc(
      "delete_studio_safely",
      {
        p_studio_id: studioId,
        p_reason: reason,
      },
    );

    if (deleteError) {
      throw deleteError;
    }

    const result: any = deleteResult;
    if (!result?.success) {
      let blockedResult = result;

      if (result?.code === "ACTIVE_BOOKINGS_EXIST") {
        const { data: activeBookings, error: activeBookingsError } =
          await serviceClient
            .from("studio_bookings")
            .select(
              `
                id,
                booking_date,
                start_time,
                end_time,
                status,
                user_id,
                profile:profiles!studio_bookings_user_id_fkey (
                  full_name,
                  email
                )
              `,
            )
            .eq("studio_id", studioId)
            .in("status", [
              "pending",
              "confirmed",
              "checked_in",
              "pending_relocation",
            ])
            .order("booking_date", { ascending: true })
            .order("start_time", { ascending: true });

        const rpcActiveBookings = Array.isArray(result?.active_bookings)
          ? result.active_bookings
          : [];

        blockedResult = {
          ...result,
          active_bookings: activeBookingsError ? rpcActiveBookings : activeBookings || rpcActiveBookings,
          active_bookings_error: activeBookingsError?.message || null,
        };
      }

      return new Response(JSON.stringify(blockedResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const dedup = new Map<string, StorageRef>();
    urls.forEach((url) => {
      const parsed = parseStorageRef(url);
      if (!parsed) return;
      dedup.set(`${parsed.bucket}::${parsed.path}`, parsed);
    });

    const grouped = new Map<string, string[]>();
    dedup.forEach(({ bucket, path }) => {
      if (!grouped.has(bucket)) grouped.set(bucket, []);
      grouped.get(bucket)!.push(path);
    });

    let deletedObjects = 0;
    const deleteErrors: Array<{ bucket: string; message: string }> = [];

    for (const [bucket, paths] of grouped.entries()) {
      const chunks = chunk(paths, 100);
      for (const pathsChunk of chunks) {
        const { data, error } = await serviceClient.storage
          .from(bucket)
          .remove(pathsChunk);

        if (error) {
          deleteErrors.push({ bucket, message: error.message });
          continue;
        }

        deletedObjects += Array.isArray(data) ? data.length : 0;
      }
    }

    return new Response(
      JSON.stringify({
        ...result,
        storage_cleanup: {
          ...(result?.storage_cleanup || {}),
          parsed_objects: dedup.size,
          deleted_objects: deletedObjects,
          delete_errors: deleteErrors,
          delete_mode: "storage_api",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        code: "DELETE_STUDIO_WITH_STORAGE_FAILED",
        error: error?.message || "Failed to delete studio with storage cleanup",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  }
});
