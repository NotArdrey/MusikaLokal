// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

function getManilaNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

function normalizeTime(value?: string | null) {
  if (!value) return "00:00:00";
  const cleaned = value.toString().trim().split(/[.+-]/)[0] || "00:00:00";
  const segments = cleaned.split(":");

  if (segments.length < 2) return "00:00:00";

  const hours = (segments[0] || "00").padStart(2, "0").slice(0, 2);
  const minutes = (segments[1] || "00").padStart(2, "0").slice(0, 2);
  const seconds = (segments[2] || "00").padStart(2, "0").slice(0, 2);

  return `${hours}:${minutes}:${seconds}`;
}

function toHours(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return (endMinutes - startMinutes) / 60;
}

function toManilaDateTime(dateValue: string, timeValue: string): Date | null {
  if (!dateValue || !timeValue) return null;

  const normalizedDate = String(dateValue).trim();
  const normalizedTime = normalizeTime(timeValue);
  const parsed = new Date(`${normalizedDate}T${normalizedTime}+08:00`);

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function insertNotificationIfMissing(
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
  const eventType = payload.meta?.event_type;
  const bookingId = payload.meta?.booking_id;

  if (eventType && bookingId) {
    const { data: existing } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", payload.user_id)
      .contains("meta", { event_type: eventType, booking_id: bookingId })
      .limit(1);

    if (existing && existing.length > 0) return;
  }

  await supabaseAdmin.from("notifications").insert({
    ...payload,
    read: false,
  });
}

async function autoStartBookingsAndNotify(
  supabaseAdmin: any,
  userId: string,
  userRole: string,
) {
  const { date: todayManila, time: nowManilaTime } = getManilaNowParts();

  let studioIds: string[] = [];
  if (userRole === "studio-owner") {
    const { data: ownerStudios } = await supabaseAdmin
      .from("studios")
      .select("id")
      .eq("owner_id", userId);

    studioIds = (ownerStudios || []).map((studio: any) => studio.id);
    if (studioIds.length === 0) return;
  }

  let bookingQuery = supabaseAdmin
    .from("studio_bookings")
    .select(
      "id, user_id, studio_id, booking_date, start_time, end_time, status, studio:studios(name, owner_id)",
    )
    .eq("status", "confirmed")
    .eq("booking_date", todayManila);

  if (userRole === "musician") {
    bookingQuery = bookingQuery.eq("user_id", userId);
  } else if (userRole === "studio-owner") {
    bookingQuery = bookingQuery.in("studio_id", studioIds);
  } else {
    return;
  }

  const { data: bookings, error: bookingError } = await bookingQuery;
  if (bookingError || !bookings || bookings.length === 0) return;

  for (const booking of bookings) {
    const startTime = normalizeTime(booking.start_time);
    const endTime = normalizeTime(booking.end_time);

    if (nowManilaTime < startTime || nowManilaTime >= endTime) {
      continue;
    }

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("studio_bookings")
      .update({
        status: "checked_in",
        check_in_time: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();

    if (updateError || !updatedBooking) {
      continue;
    }

    const studioName = booking.studio?.name || "the studio";
    const image = null;
    const recipients = [booking.user_id, booking.studio?.owner_id].filter(
      Boolean,
    ) as string[];

    for (const recipientId of [...new Set(recipients)]) {
      const isCustomer = recipientId === booking.user_id;
      await insertNotificationIfMissing(supabaseAdmin, {
        user_id: recipientId,
        type: "info",
        title: "Booking Started",
        message: isCustomer
          ? `Your booking at ${studioName} has started.`
          : `A booking at ${studioName} has started.`,
        image,
        meta: {
          booking_id: booking.id,
          studio_id: booking.studio_id,
          booking_date: booking.booking_date,
          event_type: "booking_auto_started",
        },
      });
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) {
      return new Response(JSON.stringify({ code: 401, message: "Missing Authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseClient = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Service role client for cross-user notifications
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const {
      data: { user: authUser },
      error: authUserError,
    } = await supabaseClient.auth.getUser();

    if (authUserError || !authUser) {
      return new Response(JSON.stringify({ code: 401, message: "Invalid JWT" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { action, ...params } = await req.json();

    // 1. FETCH BOOKINGS & APPLICATIONS
    if (action === "fetch") {
      const { userId } = params;

      if (userId && userId !== authUser.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      // First, get user role to determine what to fetch
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("role")
        .eq("id", userId || authUser.id)
        .single();

      if (profileError) throw profileError;

      const userRole = profile?.role;

      if (userRole === "musician" || userRole === "studio-owner") {
        await autoStartBookingsAndNotify(supabaseAdmin, userId, userRole);
      }

      const categorized = {
        Pending: [],
        Upcoming: [],
        Ongoing: [],
        Review: [],
      };

      const now = new Date();

      // A. For Musicians: Fetch their Studio Bookings as customers
      if (userRole === "musician") {
        const { data: bookings, error: bookingError } = await supabaseClient
          .from("studio_bookings")
          .select("*, studio:studios(name, owner_id, studio_media(media_url, sort_order))")
          .eq("user_id", userId)
          .order("booking_date", { ascending: false });

        if (bookingError) throw bookingError;

        // Process Studio Bookings
        // @ts-ignore
        bookings?.forEach((b: any) => {
          const bookingDate = new Date(`${b.booking_date}T${b.start_time}`);
          const endDate = new Date(`${b.booking_date}T${b.end_time}`);
          const isVenue = false;

          // DEBUG: Log date parsing for first few items
          // console.log(`[DEBUG] Booking ${b.id}: Status=${b.status}, End=${endDate.toISOString()}, Now=${now.toISOString()}`)

          // Determine status text - for pending bookings, check if payment is needed
          const isUnpaid = b.status === "pending" && (!b.payment_status || b.payment_status === "unpaid" || b.payment_status === "pending" || b.payment_status === "failed");

          const item = {
            id: b.id,
            type_id: "studio_booking",
            studio_id: b.studio_id,
            user_id: b.user_id,
            raw_date: b.booking_date,
            start_time: b.start_time,
            end_time: b.end_time,
            name: b.studio?.name || "Unknown Studio",
            date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
            image:
              b.studio?.studio_media
                ?.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))[0]
                ?.media_url ||
              "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop",
            status:
              b.status === "pending"
                ? isUnpaid
                  ? "Awaiting Payment"
                  : "Paid - Waiting for Confirmation"
                : b.status === "pending_relocation"
                  ? "Relocation Request"
                  : b.status === "confirmed"
                    ? "Confirmed"
                    : b.status === "checked_in"
                      ? "In Progress"
                      : b.status === "cancelled"
                        ? "Declined"
                        : b.status,
            type: isVenue ? "Venue Booking" : "Studio Booking",
            isCancelled: b.status === "cancelled",
            action:
              b.status === "pending_relocation"
                ? "Respond"
                : b.status === "pending"
                  ? "View Details"
                  : "Details",
            raw_status: b.status,
            duration_hours: b.hours,
            base_rate: b.base_rate,
            total_cost: b.final_price,
            modifiers_applied: b.modifiers_applied || {},
            notes: b.notes,
            reviewed_by_customer: b.reviewed_by_customer || false,
            reviewed_by_owner: b.reviewed_by_owner || false,
            proof_url: b.proof_url,
            // Payment-related fields for musician to see payment status
            payment_status: b.payment_status || "unpaid",
            payment_amount: b.payment_amount || b.final_price,
            payment_type: b.payment_type || null,
            remaining_balance: b.remaining_balance || 0,
            studio_owner_id: b.studio?.owner_id || null,
            relocation_requested_at: b.relocation_requested_at,
            relocation_expires_at: b.relocation_expires_at,
            relocation_proposed_date: b.relocation_proposed_date,
            relocation_proposed_start_time: b.relocation_proposed_start_time,
            relocation_proposed_end_time: b.relocation_proposed_end_time,
          };

          if (b.status === "pending" || b.status === "pending_relocation") {
            // @ts-ignore
            categorized.Pending.push(item);
          } else if (b.status === "confirmed") {
            if (now > endDate) {
              // AUTO-COMPLETE: If confirmed and time passed, treat as Completed (Review)
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            } else if (now >= bookingDate && now <= endDate) {
              // AUTO-ONGOING: If current time is within the booking window, treat as In Progress
              // @ts-ignore
              categorized.Ongoing.push({ ...item, status: "In Progress" });
            } else {
              // @ts-ignore
              categorized.Upcoming.push(item);
            }
          } else if (b.status === "checked_in") {
            if (now > endDate) {
              // AUTO-COMPLETE: If checked_in and time passed, it's done. Move to Review.
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            } else {
              // STRICT Ongoing Check
              // @ts-ignore
              categorized.Ongoing.push({ ...item, status: "In Progress" });
            }
          } else if (b.status === "completed") {
            // Completed bookings that need review
            if (!b.reviewed_by_customer) {
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            }
          } else if (b.status === "cancelled") {
            // @ts-ignore
            categorized.Upcoming.push(item);
          }
        });
      }

      // B. For Studio Owners: Fetch bookings for THEIR studios
      if (userRole === "studio-owner") {
        // First get their studios
        const { data: studios } = await supabaseClient
          .from("studios")
          .select("id")
          .eq("owner_id", userId);

        const studioIds = studios?.map((s: any) => s.id) || [];

        if (studioIds.length > 0) {
          const { data: bookings, error: bookingError } = await supabaseClient
            .from("studio_bookings")
            .select(
              "*, studio:studios(name, owner_id, studio_media(media_url, sort_order)), profile:user_id(full_name, avatar_url, email, contact_number, address)",
            )
            .in("studio_id", studioIds)
            .order("booking_date", { ascending: false });

          if (bookingError) throw bookingError;

          const lateReportByBooking = new Map<string, { count: number; latestAt: string | null }>();
          const bookingIds = (bookings || []).map((booking: any) => booking.id).filter(Boolean);

          if (bookingIds.length > 0) {
            const { data: lateEvents, error: lateEventsError } = await supabaseClient
              .from("booking_attendance_events")
              .select("booking_id, created_at")
              .in("booking_id", bookingIds)
              .eq("event_type", "late")
              .order("created_at", { ascending: false });

            if (lateEventsError) {
              console.log("Error fetching late attendance events:", lateEventsError);
            } else {
              (lateEvents || []).forEach((event: any) => {
                const existing = lateReportByBooking.get(event.booking_id);
                if (existing) {
                  existing.count += 1;
                  if (event.created_at && (!existing.latestAt || event.created_at > existing.latestAt)) {
                    existing.latestAt = event.created_at;
                  }
                } else {
                  lateReportByBooking.set(event.booking_id, {
                    count: 1,
                    latestAt: event.created_at || null,
                  });
                }
              });
            }
          }

          // Process Studio Bookings
          // @ts-ignore
          bookings?.forEach((b: any) => {
            const bookingDate = new Date(`${b.booking_date}T${b.start_time}`);
            const endDate = new Date(`${b.booking_date}T${b.end_time}`);
            const lateReportMeta = lateReportByBooking.get(b.id);

            const customerName =
              b.profile?.full_name || b.profile?.email || "Guest";
            const customerAvatar =
              b.profile?.avatar_url ||
              "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop";

            const isVenue = false;

            // For studio owner: show payment status for pending bookings
            const isUnpaid = b.status === "pending" && (!b.payment_status || b.payment_status === "unpaid" || b.payment_status === "pending" || b.payment_status === "failed");

            const item = {
              id: b.id,
              type_id: "studio_booking",
              studio_id: b.studio_id,
              user_id: b.user_id, // The musician who booked
              raw_date: b.booking_date,
              start_time: b.start_time,
              end_time: b.end_time,
              name: `${b.studio?.name} - ${customerName}`,
              date: `${b.booking_date} • ${b.start_time} - ${b.end_time}`,
              image:
                b.studio?.studio_media
                  ?.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))[0]
                  ?.media_url ||
                "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&h=400&fit=crop",
              status:
                b.status === "pending"
                  ? isUnpaid
                    ? "Awaiting Payment"
                    : "Paid - Waiting for Confirmation"
                  : b.status === "pending_relocation"
                    ? "Relocation Request"
                    : b.status === "confirmed"
                      ? "Confirmed"
                      : b.status === "checked_in"
                        ? "In Progress"
                        : b.status === "cancelled"
                          ? "Declined"
                          : b.status,
              type: isVenue ? "Venue Booking" : "Studio Booking",
              isCancelled: b.status === "cancelled",
              action: b.status === "pending_relocation" ? "Awaiting musician response" : "Details", // No confirmation needed - payment auto-confirms
              raw_status: b.status,
              duration_hours: b.hours, // Use stored column
              base_rate: b.base_rate,
              total_cost: b.final_price, // Use stored column
              modifiers_applied: b.modifiers_applied || {},
              studio_name: b.studio?.name,
              notes: b.notes,
              customer_name: customerName,
              customer_avatar: customerAvatar,
              customer_contact: b.profile?.contact_number,
              customer_address: b.profile?.address,
              reviewed_by_customer: b.reviewed_by_customer || false,
              reviewed_by_owner: b.reviewed_by_owner || false,
              proof_url: b.proof_url,
              // Payment-related fields
              payment_status: b.payment_status || "unpaid",
              payment_amount: b.payment_amount || b.final_price,
              payment_type: b.payment_type || null,
              remaining_balance: b.remaining_balance || 0,
              relocation_requested_at: b.relocation_requested_at,
              relocation_expires_at: b.relocation_expires_at,
              relocation_proposed_date: b.relocation_proposed_date,
              relocation_proposed_start_time: b.relocation_proposed_start_time,
              relocation_proposed_end_time: b.relocation_proposed_end_time,
              has_late_report: Boolean(lateReportMeta),
              late_report_count: lateReportMeta?.count || 0,
              late_reported_at: lateReportMeta?.latestAt || null,
            };

            if (b.status === "pending" || b.status === "pending_relocation") {
              // @ts-ignore
              categorized.Pending.push(item);
            } else if (b.status === "confirmed") {
              if (now > endDate) {
                // AUTO-COMPLETE: If confirmed and time passed, treat as Completed (Review)
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              } else if (now >= bookingDate && now <= endDate) {
                // AUTO-ONGOING: If current time is within the booking window, treat as In Progress
                // @ts-ignore
                categorized.Ongoing.push({ ...item, status: "In Progress" });
              } else {
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else if (b.status === "checked_in") {
              if (now > endDate) {
                // AUTO-COMPLETE: If checked_in and time passed, it's done. Move to Review.
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              } else {
                // STRICT Ongoing Check
                // @ts-ignore
                categorized.Ongoing.push({ ...item, status: "In Progress" });
              }
            } else if (b.status === "completed") {
              if (!b.reviewed_by_owner) {
                // @ts-ignore
                categorized.Review.push({ ...item, status: "Completed" });
              }
            } else if (b.status === "cancelled") {
              // @ts-ignore
              categorized.Upcoming.push(item);
            }
          });
        }
      }

      // C. For Musicians: Fetch Gig Applications
      if (userRole === "musician") {
        const { data: gigApps, error: gigError } = await supabaseClient
          .from("gig_applications")
          .select(
            "*, gig:gig_id(name, event_date, location, organizer:organizer_id(avatar_url), gig_media(media_url, sort_order)), group:group_id(name)",
          )
          .eq("applicant_id", userId)
          .order("created_at", { ascending: false });

        if (gigError) {
          console.log("Error fetching gig apps:", gigError);
        }

        // Process Gig Applications
        // @ts-ignore
        gigApps?.forEach((g: any) => {
          const normalizedStatus = (g.status || "").toLowerCase();
          const gig = g.gig;
          const dateStr =
            gig?.event_date || g.created_at?.split("T")[0] || "TBA";

          // Parse event date for time-based categorization
          let eventDate: Date | null = null;
          if (gig?.event_date) {
            eventDate = new Date(gig.event_date);
            // Assume gig ends at midnight of the same day if no end time
            eventDate.setHours(23, 59, 59, 999);
          }

          const item = {
            id: g.id,
            type_id: "gig_application",
            gig_id: g.gig_id,
            group_id: g.group_id, // Include group_id for musicians
            performer: g.group?.name || null, // Group name if applied as group
            raw_date: dateStr,
            start_time: gig?.event_date, // Add for consistency
            name: gig?.name || "Unknown Gig",
            date: dateStr,
            image:
              gig?.gig_media
                ?.sort((a: any, b: any) => a.sort_order - b.sort_order)[0]
                ?.media_url ||
              gig?.organizer?.avatar_url ||
              "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&h=200&fit=crop",
            status:
              normalizedStatus === "pending"
                ? "Applied"
                : normalizedStatus === "accepted"
                  ? "Accepted"
                  : normalizedStatus === "completed"
                    ? "Completed"
                    : normalizedStatus === "rejected" ||
                        normalizedStatus === "cancelled" ||
                        normalizedStatus === "fired"
                      ? "Fired"
                      : g.status,
            type: g.group_id ? "Group Application" : "Solo Application",
            isCancelled:
              normalizedStatus === "cancelled" ||
              normalizedStatus === "rejected" ||
              normalizedStatus === "fired",
            action: normalizedStatus === "accepted" ? "View Details" : "Details",
            location: gig?.location,
            reviewed_by_applicant: g.reviewed_by_applicant || false,
          };

          if (normalizedStatus === "pending") {
            // @ts-ignore
            categorized.Pending.push(item);
          } else if (normalizedStatus === "accepted") {
            // Time-based categorization for accepted gigs
            if (eventDate) {
              const eventStart = new Date(gig.event_date);
              eventStart.setHours(0, 0, 0, 0); // Start of event day

              if (now >= eventStart && now <= eventDate) {
                // Gig is happening today
                // @ts-ignore
                categorized.Ongoing.push({ ...item, status: "Happening Now" });
              } else if (now > eventDate) {
                // Gig has ended - show in Review if not yet reviewed
                if (!g.reviewed_by_applicant) {
                  // @ts-ignore
                  categorized.Review.push({ ...item, status: "Completed" });
                }
              } else {
                // Gig is in the future
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else {
              // No event date, put in Upcoming by default
              // @ts-ignore
              categorized.Upcoming.push(item);
            }
          } else if (
            normalizedStatus === "rejected" ||
            normalizedStatus === "cancelled" ||
            normalizedStatus === "fired"
          ) {
            // @ts-ignore
            categorized.Review.push({ ...item, status: "Fired" });
          } else if (normalizedStatus === "completed") {
            // @ts-ignore
            categorized.Review.push({ ...item, status: "Completed" });
          }
        });

        // Leader confirmation queue: applications submitted by members to leader-owned groups
        const { data: leaderPendingApps, error: leaderPendingError } = await supabaseClient
          .from("gig_applications")
          .select(
            "*, gig:gig_id(name, event_date, location), group:group_id(id, name, group_type, owner_id), submitter:submitted_by_user_id(full_name, avatar_url)",
          )
          .eq("status", "pending")
          .eq("leader_approval_status", "pending")
          .neq("submitted_by_user_id", userId)
          .order("created_at", { ascending: false });

        if (leaderPendingError) {
          console.log("Error fetching leader pending apps:", leaderPendingError);
        }

        // @ts-ignore
        leaderPendingApps?.forEach((app: any) => {
          if (app.group?.owner_id !== userId) return;

          const gig = app.gig;
          const dateStr = gig?.event_date || app.created_at?.split("T")[0] || "TBA";
          const performerName = app.group?.name || "Group";
          const submitterName = app.submitter?.full_name || "Group Member";

          const item = {
            id: app.id,
            type_id: "gig_application",
            leader_approval_required: true,
            gig_id: app.gig_id,
            group_id: app.group_id,
            applicant_id: app.applicant_id,
            submitted_by_user_id: app.submitted_by_user_id,
            performer: performerName,
            customer_name: submitterName,
            raw_date: dateStr,
            start_time: gig?.event_date,
            name: gig?.name || "Unknown Gig",
            date: dateStr,
            image:
              app.submitter?.avatar_url ||
              "https://picsum.photos/400/300",
            status: "Awaiting Your Approval",
            type: app.group?.group_type === "duo" ? "Duo Application" : "Group Application",
            isCancelled: false,
            action: "Review",
            location: gig?.location,
            pitch_message: app.pitch_message,
            video_url: app.video_url,
            cv_url: app.cv_url,
            created_at: app.created_at,
          };

          // @ts-ignore
          categorized.Pending.push(item);
        });
      }

      // D. For Venue Owners: Fetch accepted applications for their gigs
      if (userRole === "venue-owner") {
        // First get their gigs
        const { data: gigs } = await supabaseClient
          .from("gigs")
          .select("id, name, event_date, location")
          .eq("organizer_id", userId);

        const gigIds = gigs?.map((g: any) => g.id) || [];

        if (gigIds.length > 0) {
          const { data: acceptedApps, error: appError } = await supabaseClient
            .from("gig_applications")
            .select(
              `
                            *,
                            applicant:applicant_id(full_name, avatar_url),
                            group:group_id(name)
                        `,
            )
            .in("gig_id", gigIds)
            .in("status", ["accepted", "pending", "rejected", "cancelled", "completed"])
            .or("leader_approval_status.is.null,leader_approval_status.eq.approved")
            .order("created_at", { ascending: false });

          if (appError) {
            console.log("Error fetching accepted applications:", appError);
          }

          // Process accepted applications
          acceptedApps?.forEach((app: any) => {
            const gig = gigs?.find((g: any) => g.id === app.gig_id);
            const dateStr = gig?.event_date || "TBA";
            const performerName =
              app.group?.name || app.applicant?.full_name || "Performer";

            // Parse event date for time-based categorization
            let eventDate: Date | null = null;
            if (gig?.event_date) {
              eventDate = new Date(gig.event_date);
              eventDate.setHours(23, 59, 59, 999);
            }

            const item = {
              id: app.id,
              type_id: "gig_application",
              gig_id: app.gig_id,
              group_id: app.group_id, // Include group_id
              applicant_id: app.applicant_id, // For renew contract
              user_id: app.applicant_id, // For profile link
              raw_date: dateStr,
              name: `${gig?.name || "Gig"} - ${performerName}`,
              date: dateStr,
              image:
                app.applicant?.avatar_url ||
                "https://picsum.photos/400/300",
              status:
                app.status === "pending"
                  ? "Action Required"
                  : app.status === "accepted"
                    ? "Confirmed"
                    : app.status === "rejected" || app.status === "cancelled"
                      ? "Fired"
                      : "Completed",
              type: app.group_id ? "Group Application" : "Solo Application",
              isCancelled: app.status === "rejected" || app.status === "cancelled",
              action: app.status === "pending" ? "Confirm Now" : "View Details",
              location: gig?.location,
              performer: performerName,
              customer_name: performerName,
              customer_avatar: app.applicant?.avatar_url,
              video_url: app.video_url,
              cv_url: app.cv_url, // Added CV URL
              note: app.note,
              pitch_message: app.pitch_message, // Added pitch message
              group_members: [], // Include group members for display
              reviewed_by_organizer: app.reviewed_by_organizer || false,
            };

            if (app.status === "pending") {
              // @ts-ignore
              categorized.Pending.push(item);
            } else if (app.status === "accepted") {
              // Accepted musicians always go to Active Musicians (Upcoming/Ongoing), never to Completed
              if (eventDate) {
                const eventStart = new Date(gig.event_date);
                eventStart.setHours(0, 0, 0, 0);

                if (now >= eventStart && now <= eventDate) {
                  // Gig is happening today - Ongoing
                  // @ts-ignore
                  categorized.Ongoing.push({
                    ...item,
                    status: "Happening Now",
                  });
                } else {
                  // Future or past-date accepted musicians stay in Upcoming (Active Musicians)
                  // @ts-ignore
                  categorized.Upcoming.push(item);
                }
              } else {
                // No event date, put in Upcoming by default
                // @ts-ignore
                categorized.Upcoming.push(item);
              }
            } else if (app.status === "rejected" || app.status === "cancelled") {
              // Fired musicians go to Review (Completed tab)
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Fired" });
            } else if (app.status === "completed") {
              // Completed contracts go to Review (Completed tab) - can be renewed
              // @ts-ignore
              categorized.Review.push({ ...item, status: "Completed" });
            }
          });
        }
      }

      return new Response(JSON.stringify(categorized), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. CREATE BOOKING (Studio) - Supports multiple time slots
    if (action === "create") {
      const {
        studio_id,
        user_id,
        date,
        start_time,
        end_time,
        time_slots,
        notes,
        session_type, // "rehearsal" or "recording"
      } = params;

      if (!user_id || user_id !== authUser.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      // Support both old single-slot format and new multi-slot format
      let slots: Array<{ start: string; end: string }> = [];

      if (time_slots && Array.isArray(time_slots) && time_slots.length > 0) {
        // New multi-slot format
        slots = time_slots;
        console.log("📥 Creating multi-slot booking:", {
          studio_id,
          user_id,
          date,
          time_slots,
        });
      } else if (start_time && end_time) {
        // Backwards compatibility: single slot format
        slots = [{ start: start_time, end: end_time }];
        console.log("📥 Creating single-slot booking:", {
          studio_id,
          user_id,
          date,
          start_time,
          end_time,
        });
      } else {
        return new Response(
          JSON.stringify({
            error:
              "Invalid booking request. Provide either time_slots array or start_time/end_time.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Validate slots are not empty
      if (slots.length === 0) {
        return new Response(
          JSON.stringify({
            error: "At least one time slot is required.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      slots = slots
        .map((slot) => ({
          start: normalizeTime(slot?.start).slice(0, 5),
          end: normalizeTime(slot?.end).slice(0, 5),
        }))
        .filter((slot) => slot.start && slot.end);

      if (slots.length === 0) {
        return new Response(
          JSON.stringify({
            error: "At least one valid time slot is required.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const bookingDateStartUtc = toManilaDateTime(date, "00:00:00");
      const nowUtc = new Date();

      if (!bookingDateStartUtc) {
        return new Response(
          JSON.stringify({
            error: "Invalid booking date.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { date: todayManilaDate } = getManilaNowParts();
      const todayManilaStartUtc = toManilaDateTime(todayManilaDate, "00:00:00");

      if (!todayManilaStartUtc) {
        return new Response(
          JSON.stringify({
            error: "Server time validation failed. Please try again.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      const { data: studioSettingsData, error: studioSettingsError } = await supabaseClient
        .from("studio_settings")
        .select("lead_time_hours, booking_horizon_days, min_booking_duration_hours")
        .eq("studio_id", studio_id)
        .maybeSingle();

      if (studioSettingsError) {
        console.warn("⚠️ Could not load studio settings, using defaults:", studioSettingsError);
      }

      const leadTimeHours = Math.max(0, Number(studioSettingsData?.lead_time_hours ?? 24));
      const bookingHorizonDays = Math.max(1, Number(studioSettingsData?.booking_horizon_days ?? 90));
      const configuredMinBookingDurationHours = Number(
        studioSettingsData?.min_booking_duration_hours ?? 0,
      );
      const minBookingDurationHours = Number.isFinite(configuredMinBookingDurationHours)
        ? Math.max(0, Math.min(1, configuredMinBookingDurationHours))
        : 1;

      const dayDiff = Math.floor(
        (bookingDateStartUtc.getTime() - todayManilaStartUtc.getTime()) /
          (24 * 60 * 60 * 1000),
      );

      if (dayDiff < 0) {
        return new Response(
          JSON.stringify({
            error: "Cannot create a booking in the past.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      if (dayDiff > bookingHorizonDays) {
        return new Response(
          JSON.stringify({
            error: `Bookings can only be made up to ${bookingHorizonDays} day(s) in advance.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      const minAllowedStartUtc = new Date(
        nowUtc.getTime() + leadTimeHours * 60 * 60 * 1000,
      );

      for (const slot of slots) {
        const slotStartUtc = toManilaDateTime(date, slot.start);
        const slotEndUtc = toManilaDateTime(date, slot.end);

        if (!slotStartUtc || !slotEndUtc || slotEndUtc <= slotStartUtc) {
          return new Response(
            JSON.stringify({
              error: `Invalid time slot: ${slot.start} - ${slot.end}.`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }

        if (slotStartUtc < nowUtc) {
          return new Response(
            JSON.stringify({
              error: "Cannot create a booking for a past time slot.",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }

        if (slotStartUtc < minAllowedStartUtc) {
          return new Response(
            JSON.stringify({
              error: `This studio requires at least ${leadTimeHours} hour(s) advance booking.`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }

        const durationHours =
          (slotEndUtc.getTime() - slotStartUtc.getTime()) / (60 * 60 * 1000);

        if (minBookingDurationHours > 0 && durationHours < minBookingDurationHours) {
          return new Response(
            JSON.stringify({
              error: `Each booking slot must be at least ${minBookingDurationHours} hour(s).`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 409,
            },
          );
        }
      }

      // Check if user already has a pending booking for this studio ON THIS DATE (prevent spam)
      const { data: existingPendingBooking, error: existingError } =
        await supabaseClient
          .from("studio_bookings")
          .select("id, status, booking_date")
          .eq("studio_id", studio_id)
          .eq("user_id", user_id)
          .eq("booking_date", date)
          .eq("status", "pending")
          .maybeSingle();

      if (existingError) {
        console.error("Error checking existing bookings:", existingError);
      }

      if (existingPendingBooking) {
        return new Response(
          JSON.stringify({
            error:
              "You already have a pending booking for this studio on this date. Please wait for the studio owner to respond, or cancel your existing booking to create a new one.",
            existing_booking_id: existingPendingBooking.id,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409, // Conflict
          },
        );
      }

      // Use multi-slot availability check
      console.log("🔍 Checking multi-slot availability...");
      const { data: isAvailable, error: availError } = await supabaseClient.rpc(
        "are_slots_available",
        {
          p_studio_id: studio_id,
          p_booking_date: date,
          p_time_slots: slots,
          p_user_id: user_id,
        },
      );

      if (availError) {
        console.error("❌ Availability check error:", availError);
        // Fallback to single-slot check if new function doesn't exist
        if (
          availError.message?.includes("function") ||
          availError.code === "42883"
        ) {
          console.log("⚠️ Falling back to single-slot availability check...");
          // Check each slot individually using old function
          for (const slot of slots) {
            const { data: slotAvailable, error: slotError } =
              await supabaseClient.rpc("is_slot_available", {
                p_studio_id: studio_id,
                p_booking_date: date,
                p_start_time: slot.start,
                p_end_time: slot.end,
                p_user_id: user_id,
              });

            if (slotError) {
              return new Response(
                JSON.stringify({
                  error: "Availability check failed: " + slotError.message,
                }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                  status: 400,
                },
              );
            }

            if (!slotAvailable) {
              return new Response(
                JSON.stringify({
                  error: `Time slot ${slot.start} - ${slot.end} is not available.`,
                }),
                {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                  },
                  status: 409,
                },
              );
            }
          }
        } else {
          return new Response(
            JSON.stringify({
              error: "Availability check failed: " + availError.message,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }
      } else if (!isAvailable) {
        return new Response(
          JSON.stringify({
            error:
              "One or more time slots are not available. They may be outside operating hours, overlap with another booking, or the studio may be closed on this date.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409, // Conflict
          },
        );
      }

      console.log("✅ All slots available");

      // First, verify studio has a valid hourly rate
      const { data: studioData, error: studioError } = await supabaseClient
        .from("studios")
        .select("id, name, hourly_rate")
        .eq("id", studio_id)
        .single();

      if (studioError || !studioData) {
        console.error("❌ Studio not found:", studioError);
        return new Response(
          JSON.stringify({
            error: "Studio not found.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      console.log("📊 Studio data:", studioData);

      if (!studioData.hourly_rate || studioData.hourly_rate <= 0) {
        console.error(
          "❌ Studio has no valid hourly rate:",
          studioData.hourly_rate,
        );
        return new Response(
          JSON.stringify({
            error:
              "This studio does not have a valid hourly rate configured. Please contact the studio owner.",
            debug: { studio_id, hourly_rate: studioData.hourly_rate },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Calculate pricing for all slots combined
      console.log("💰 Calculating multi-slot booking price...");
      let pricingData: any = null;

      const { data: pricing, error: pricingError } = await supabaseClient.rpc(
        "calculate_multi_slot_price",
        {
          p_studio_id: studio_id,
          p_booking_date: date,
          p_time_slots: slots,
          p_session_type: session_type || "rehearsal",
        },
      );

      if (pricingError) {
        console.error("❌ Multi-slot pricing error:", pricingError);
        // Fallback to calculating each slot and summing
        if (
          pricingError.message?.includes("function") ||
          pricingError.code === "42883"
        ) {
          console.log("⚠️ Falling back to individual slot pricing...");
          let totalHours = 0;
          let totalPrice = 0;
          let baseRate = 0;

          for (const slot of slots) {
            const { data: slotPricing } = await supabaseClient.rpc(
              "calculate_booking_price",
              {
                p_studio_id: studio_id,
                p_booking_date: date,
                p_start_time: slot.start,
                p_end_time: slot.end,
                p_session_type: session_type || "rehearsal",
              },
            );

            if (slotPricing && slotPricing[0]) {
              totalHours += slotPricing[0].hours || 0;
              totalPrice += slotPricing[0].final_price || 0;
              baseRate = slotPricing[0].base_rate || baseRate;
            }
          }

          pricingData = {
            base_rate: baseRate,
            hours: totalHours,
            subtotal: baseRate * totalHours,
            modifiers: {},
            final_price: totalPrice,
          };
        } else {
          return new Response(
            JSON.stringify({
              error: "Pricing calculation failed: " + pricingError.message,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            },
          );
        }
      } else if (pricing && pricing.length > 0) {
        pricingData = pricing[0];
      }

      if (!pricingData) {
        console.error(
          "❌ No pricing data returned, falling back to manual calculation",
        );
        // Fallback: Calculate manually using studio's hourly rate
        let totalHours = 0;
        for (const slot of slots) {
          const startParts = slot.start.split(":").map(Number);
          const endParts = slot.end.split(":").map(Number);
          const startMinutes = startParts[0] * 60 + startParts[1];
          const endMinutes = endParts[0] * 60 + endParts[1];
          totalHours += (endMinutes - startMinutes) / 60;
        }

        pricingData = {
          base_rate: studioData.hourly_rate,
          hours: totalHours,
          total_hours: totalHours,
          subtotal: studioData.hourly_rate * totalHours,
          modifiers: {},
          final_price: studioData.hourly_rate * totalHours,
        };
        console.log("📊 Manual pricing fallback:", pricingData);
      }

      console.log("✅ Pricing calculated:", pricingData);

      // Get overall start and end times (for backwards compatibility)
      const allStartTimes = slots.map((s) => s.start).sort();
      const allEndTimes = slots.map((s) => s.end).sort();
      const overallStart = allStartTimes[0];
      const overallEnd = allEndTimes[allEndTimes.length - 1];

      // Validate pricing data before insert - use studio rate as fallback
      const finalBaseRate = pricingData.base_rate || studioData.hourly_rate;
      const finalHours = pricingData.total_hours || pricingData.hours;

      if (!finalBaseRate || finalBaseRate <= 0) {
        console.error("❌ Invalid base rate:", { pricingData, studioData });
        return new Response(
          JSON.stringify({
            error:
              "Unable to calculate booking price. Studio may not have a valid hourly rate configured.",
            debug: {
              pricingData,
              studio_id,
              studio_hourly_rate: studioData.hourly_rate,
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      if (!finalHours || finalHours <= 0) {
        console.error("❌ Invalid hours calculated:", { pricingData, slots });
        return new Response(
          JSON.stringify({
            error: "Invalid booking duration. Please select valid time slots.",
            debug: { pricingData, slots },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      console.log("📤 Inserting multi-slot booking...", {
        studio_id,
        user_id,
        date,
        overallStart,
        overallEnd,
        slots,
        base_rate: finalBaseRate,
        hours: finalHours,
        subtotal: pricingData.subtotal || finalBaseRate * finalHours,
        final_price: pricingData.final_price || finalBaseRate * finalHours,
      });

      const bookingInsertPayload: Record<string, any> = {
        studio_id,
        user_id,
        booking_date: date,
        start_time: overallStart,
        end_time: overallEnd,
        notes: notes || null,
        status: "pending",
        session_type: session_type || "rehearsal",
        base_rate: finalBaseRate,
        hours: finalHours,
        subtotal: pricingData.subtotal || finalBaseRate * finalHours,
        modifiers_applied: pricingData.modifiers || {},
        final_price: pricingData.final_price || finalBaseRate * finalHours,
      };

      const { data: insertData, error: insertError } = await supabaseClient
        .from("studio_bookings")
        .insert(bookingInsertPayload)
        .select()
        .single();

      if (insertError) {
        console.error("❌ Insert error:", insertError);
        throw insertError;
      }

      const data = insertData;

      const slotRows = slots.map((slot, index) => ({
        booking_id: data.id,
        start_time: slot.start,
        end_time: slot.end,
        sort_order: index,
      }));

      const { error: slotInsertError } = await supabaseAdmin
        .from("studio_booking_slots")
        .insert(slotRows);

      if (slotInsertError) {
        console.error("❌ Slot insert error:", slotInsertError);
        await supabaseAdmin.from("studio_bookings").delete().eq("id", data.id);
        throw slotInsertError;
      }

      // Notify studio owner of new booking request
      try {
        const { data: studioInfo } = await supabaseClient
          .from("studios")
          .select("owner_id, name")
          .eq("id", studio_id)
          .single();

        if (studioInfo?.owner_id) {
          await supabaseAdmin.from("notifications").insert({
            user_id: studioInfo.owner_id,
            type: "info",
            title: "New Booking Request",
            message: `New booking request for ${studioInfo.name} on ${date}.`,
            image: null,
            read: false,
            meta: {
              studio_id,
              booking_id: data.id,
              booking_date: date,
            },
          });
        }
      } catch (notifyError) {
        console.error(
          "Error sending booking request notification:",
          notifyError,
        );
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201,
      });
    }

    // 3. UPDATE STATUS (Cancel/Confirm)
    if (action === "update_status") {
      const { booking_id, new_status, type_id, cancellation_reason } = params; // type_id: 'studio_booking' or 'gig_application'

      console.log("📝 update_status called with:", {
        booking_id,
        new_status,
        type_id,
        cancellation_reason,
      });

      let table = "studio_bookings";
      if (type_id === "gig_application") table = "gig_applications";

      console.log("📝 Updating table:", table);

      const attendanceIssueStatuses = ["late", "not_attending", "no_show"];
      const isAttendanceIssue =
        table === "studio_bookings" &&
        attendanceIssueStatuses.includes(new_status);

      if (isAttendanceIssue) {
        const { data: bookingInfo } = await supabaseClient
          .from("studio_bookings")
          .select("id, user_id, studio_id, booking_date, start_time, studio:studios(name, owner_id)")
          .eq("id", booking_id)
          .single();

        if (bookingInfo) {
          const reporterId = params.userId || null;
          const studioName = bookingInfo.studio?.name || "the studio";
          const eventLabel =
            new_status === "late"
              ? "reported late"
              : "reported not attending";

          const recipients = [bookingInfo.user_id, bookingInfo.studio?.owner_id]
            .filter(Boolean) as string[];

          for (const recipientId of [...new Set(recipients)]) {
            await insertNotificationIfMissing(supabaseAdmin, {
              user_id: recipientId,
              type: "warning",
              title: new_status === "late" ? "Late Arrival Alert" : "Attendance Alert",
              message:
                new_status === "late"
                  ? `A participant for the booking at ${studioName} on ${bookingInfo.booking_date} (${bookingInfo.start_time}) has reported they will be late.`
                  : `A participant for the booking at ${studioName} on ${bookingInfo.booking_date} (${bookingInfo.start_time}) has reported they cannot attend.`,
              image: null,
              meta: {
                booking_id: bookingInfo.id,
                studio_id: bookingInfo.studio_id,
                booking_date: bookingInfo.booking_date,
                issue_status: new_status,
                event_type: `booking_${new_status}`,
                reported_by_user_id: reporterId,
                reporter_event: eventLabel,
              },
            });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Attendance notification sent.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const updateData: any = { status: new_status };

      if (table === "gig_applications") {
        const { data: targetApplication, error: targetError } = await supabaseAdmin
          .from("gig_applications")
          .select("id, applicant_id, gig_id")
          .eq("id", booking_id)
          .maybeSingle();

        if (targetError) throw targetError;

        if (!targetApplication) {
          return new Response(JSON.stringify({ error: "Application not found" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          });
        }

        const { data: targetGig, error: targetGigError } = await supabaseAdmin
          .from("gigs")
          .select("id, organizer_id")
          .eq("id", targetApplication.gig_id)
          .maybeSingle();

        if (targetGigError) throw targetGigError;

        const isOrganizer = targetGig?.organizer_id === authUser.id;
        const isApplicant = targetApplication.applicant_id === authUser.id;
        const organizerAllowedStatuses = ["accepted", "rejected", "completed", "cancelled"];
        const applicantAllowedStatuses = ["cancelled"];

        if (
          !(isOrganizer && organizerAllowedStatuses.includes(new_status)) &&
          !(isApplicant && applicantAllowedStatuses.includes(new_status))
        ) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          });
        }
      }

      // Add cancellation_reason if status is cancelled/rejected and reason is provided
      if (
        (new_status === "cancelled" || new_status === "rejected") &&
        cancellation_reason
      ) {
        updateData.cancellation_reason = cancellation_reason;
      }

      console.log("📝 Update data:", updateData);

      const updateClient = table === "gig_applications" ? supabaseAdmin : supabaseClient;

      const { data, error } = await updateClient
        .from(table)
        .update(updateData)
        .eq("id", booking_id)
        .select()
        .maybeSingle();

      console.log("📝 Update result:", { data, error });

      if (error) throw error;

      if (!data) {
        return new Response(JSON.stringify({ error: "No matching record updated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // NOTIFICATION LOGIC
      if (
        ["cancelled", "rejected", "confirmed", "accepted", "completed"].includes(new_status)
      ) {
        try {
          const notificationEventType = `${table}_${new_status}`;

          // Determine who to notify
          let targetUserId = null;
          let notificationTitle = "";
          let notificationMessage = "";
          let notificationType = "info";
          let notificationImage: string | null = null;

          if (table === "studio_bookings") {
            // For Studio Bookings
            const { data: bookingInfo } = await supabaseClient
              .from("studio_bookings")
              .select("user_id, studio:studios(name, images)")
              .eq("id", booking_id)
              .single();

            if (bookingInfo) {
              notificationImage = Array.isArray(bookingInfo.studio?.images)
                ? bookingInfo.studio.images[0] || null
                : null;

              if (new_status === "cancelled") {
                targetUserId = bookingInfo.user_id;
                notificationTitle = "Booking Declined";
                notificationMessage = cancellation_reason
                  ? `Your booking at ${bookingInfo.studio.name} has been declined/cancelled. Reason: ${cancellation_reason}`
                  : `Your booking at ${bookingInfo.studio.name} has been declined/cancelled.`;
                notificationType = "error";
              } else if (new_status === "confirmed") {
                targetUserId = bookingInfo.user_id;
                notificationTitle = "Booking Confirmed!";
                notificationMessage = `Your booking at ${bookingInfo.studio.name} has been confirmed.`;
                notificationType = "success";
              }
            }
          } else if (table === "gig_applications") {
            // For Gig Applications
            const { data: applicationInfo, error: applicationInfoError } = await supabaseAdmin
              .from("gig_applications")
              .select("applicant_id, gig_id")
              .eq("id", booking_id)
              .maybeSingle();

            if (applicationInfoError) throw applicationInfoError;

            let gigMeta: { name?: string; images?: string[] | null } | null = null;
            if (applicationInfo?.gig_id) {
              const { data: gigRow, error: gigRowError } = await supabaseAdmin
                .from("gigs")
                .select("name, images")
                .eq("id", applicationInfo.gig_id)
                .maybeSingle();

              if (gigRowError) throw gigRowError;
              gigMeta = gigRow as any;
            }

            if (applicationInfo) {
              notificationImage = Array.isArray(gigMeta?.images)
                ? gigMeta.images[0] || null
                : null;

              if (new_status === "rejected") {
                targetUserId = applicationInfo.applicant_id;
                notificationTitle = "Application Declined";
                notificationMessage = `Your application for ${gigMeta?.name || "this gig"} has been declined.`;
                notificationType = "error";
              } else if (new_status === "accepted") {
                targetUserId = applicationInfo.applicant_id;
                notificationTitle = "Application Accepted!";
                notificationMessage = `Your application for ${gigMeta?.name || "this gig"} has been accepted!`;
                notificationType = "success";
              } else if (new_status === "completed") {
                targetUserId = applicationInfo.applicant_id;
                notificationTitle = "Gig Completed";
                notificationMessage = `Your contract for ${gigMeta?.name || "this gig"} has been marked as completed.`;
                notificationType = "success";
              }
            }
          }

          if (targetUserId) {
            await insertNotificationIfMissing(supabaseAdmin, {
              user_id: targetUserId,
              type: notificationType,
              title: notificationTitle,
              message: notificationMessage,
              image: notificationImage,
              meta: {
                booking_id: booking_id,
                source_table: table,
                status: new_status,
                event_type: notificationEventType,
              },
            });
            console.log(
              `🔔 Notification sent to ${targetUserId}: ${notificationTitle}`,
            );
          }
        } catch (notifyError) {
          console.error("Error sending notification:", notifyError);
        }
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 3A. PARTIAL SLOT APPROVAL (Studio Owner)
    if (action === "partial_slot_approval") {
      const {
        booking_id,
        user_id,
        accepted_slots,
        declined_slots,
        cancellation_reason,
      } = params;

      if (!booking_id || !user_id || !Array.isArray(accepted_slots)) {
        return new Response(
          JSON.stringify({
            error: "booking_id, user_id, and accepted_slots are required.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const safeDeclinedSlots = Array.isArray(declined_slots)
        ? declined_slots
        : [];

      const { data: bookingDetails, error: bookingError } = await supabaseClient
        .from("studio_bookings")
        .select(
          "id, user_id, studio_id, booking_date, status, base_rate, hours, final_price, studio:studios(name, owner_id, hourly_rate)",
        )
        .eq("id", booking_id)
        .single();

      if (bookingError || !bookingDetails) {
        return new Response(
          JSON.stringify({ error: "Booking not found." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      if (bookingDetails.studio?.owner_id !== user_id) {
        return new Response(
          JSON.stringify({ error: "Not authorized to update this booking." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      if (bookingDetails.status !== "pending") {
        return new Response(
          JSON.stringify({ error: "Only pending bookings can be partially approved." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      if (accepted_slots.length === 0) {
        const declineReason =
          cancellation_reason || "All requested time slots were declined by the studio owner.";

        const { error: cancelError } = await supabaseAdmin
          .from("studio_bookings")
          .update({
            status: "cancelled",
            cancellation_reason: declineReason,
          })
          .eq("id", booking_id);

        if (cancelError) throw cancelError;

        await supabaseAdmin
          .from("notifications")
          .insert({
            user_id: bookingDetails.user_id,
            type: "warning",
            title: "Booking Declined",
            message: `Your booking request for ${bookingDetails.studio?.name || "this studio"} has been declined.`,
            read: false,
            meta: {
              booking_id,
              studio_id: bookingDetails.studio_id,
              event_type: "booking_all_slots_declined",
            },
          });

        return new Response(
          JSON.stringify({ success: true, status: "cancelled" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      const normalizedAcceptedSlots = accepted_slots.map((slot: any) => ({
        start: normalizeTime(slot?.start),
        end: normalizeTime(slot?.end),
      }));

      const totalHours = normalizedAcceptedSlots.reduce(
        (sum: number, slot: any) => sum + toHours(slot.start, slot.end),
        0,
      );

      if (totalHours <= 0) {
        return new Response(
          JSON.stringify({ error: "Accepted slots must have a positive duration." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const sortedStarts = normalizedAcceptedSlots
        .map((slot: any) => slot.start)
        .sort();
      const sortedEnds = normalizedAcceptedSlots
        .map((slot: any) => slot.end)
        .sort();

      const overallStart = sortedStarts[0];
      const overallEnd = sortedEnds[sortedEnds.length - 1];
      const computedBaseRate =
        bookingDetails.base_rate ||
        bookingDetails.studio?.hourly_rate ||
        (bookingDetails.hours && bookingDetails.hours > 0
          ? bookingDetails.final_price / bookingDetails.hours
          : 0);
      const recomputedPrice = Number((computedBaseRate * totalHours).toFixed(2));

      const { error: updateError } = await supabaseAdmin
        .from("studio_bookings")
        .update({
          status: "confirmed",
          start_time: overallStart,
          end_time: overallEnd,
          hours: totalHours,
          subtotal: recomputedPrice,
          final_price: recomputedPrice,
          cancellation_reason:
            safeDeclinedSlots.length > 0
              ? cancellation_reason || "Some requested time slots were declined."
              : null,
        })
        .eq("id", booking_id);

      if (updateError) throw updateError;

      const { error: clearSlotsError } = await supabaseAdmin
        .from("studio_booking_slots")
        .delete()
        .eq("booking_id", booking_id);

      if (clearSlotsError) throw clearSlotsError;

      const slotRows = normalizedAcceptedSlots.map((slot: any, index: number) => ({
        booking_id,
        start_time: slot.start,
        end_time: slot.end,
        sort_order: index,
      }));

      const { error: insertSlotsError } = await supabaseAdmin
        .from("studio_booking_slots")
        .insert(slotRows);

      if (insertSlotsError) throw insertSlotsError;

      const slotLabel = normalizedAcceptedSlots
        .map((slot: any) => `${slot.start.slice(0, 5)}-${slot.end.slice(0, 5)}`)
        .join(", ");

      await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: bookingDetails.user_id,
          type: safeDeclinedSlots.length > 0 ? "info" : "success",
          title:
            safeDeclinedSlots.length > 0
              ? "Booking Partially Approved"
              : "Booking Confirmed!",
          message:
            safeDeclinedSlots.length > 0
              ? `Your booking was partially approved. Accepted slots: ${slotLabel}.`
              : `Your booking at ${bookingDetails.studio?.name || "the studio"} has been confirmed.`,
          read: false,
          meta: {
            booking_id,
            studio_id: bookingDetails.studio_id,
            accepted_slots: normalizedAcceptedSlots,
            declined_slots: safeDeclinedSlots,
            event_type:
              safeDeclinedSlots.length > 0
                ? "booking_partial_slot_approval"
                : "booking_confirmed",
          },
        });

      return new Response(
        JSON.stringify({
          success: true,
          status: "confirmed",
          accepted_slots: normalizedAcceptedSlots,
          declined_slots: safeDeclinedSlots,
          hours: totalHours,
          final_price: recomputedPrice,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // 4. CREATE REVIEW
    if (action === "create_review") {
      const {
        userId,
        rating,
        content,
        studioId,
        gigId,
        groupId,
        targetUserId, // For reviewing a user (musician or owner)
        bookingId,
        bookingType, // 'studio_booking' or 'gig_application'
        reviewerRole, // 'customer' or 'owner' / 'applicant' or 'organizer'
      } = params;

      // Enforce role ownership against the booking to avoid mis-targeted reviews.
      if (bookingId && bookingType === "studio_booking") {
        const { data: bookingAuth, error: bookingAuthError } = await supabaseClient
          .from("studio_bookings")
          .select("id, user_id, studio:studios(owner_id)")
          .eq("id", bookingId)
          .single();

        if (bookingAuthError || !bookingAuth) {
          return new Response(
            JSON.stringify({ error: "Studio booking not found." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }

        const isStudioOwnerReviewer = reviewerRole === "owner" && bookingAuth.studio?.owner_id === userId;
        const isCustomerReviewer = reviewerRole === "customer" && bookingAuth.user_id === userId;

        if (!isStudioOwnerReviewer && !isCustomerReviewer) {
          return new Response(
            JSON.stringify({ error: "You are not allowed to submit this studio review." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
          );
        }
      }

      if (bookingId && bookingType === "gig_application") {
        const { data: appAuth, error: appAuthError } = await supabaseClient
          .from("gig_applications")
          .select("id, applicant_id, group_id, gig:gig_id(organizer_id)")
          .eq("id", bookingId)
          .single();

        if (appAuthError || !appAuth) {
          return new Response(
            JSON.stringify({ error: "Gig application not found." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
          );
        }

        const isOrganizerReviewer = reviewerRole === "organizer" && appAuth.gig?.organizer_id === userId;
        const isApplicantReviewer = reviewerRole === "applicant" && appAuth.applicant_id === userId;

        if (!isOrganizerReviewer && !isApplicantReviewer) {
          return new Response(
            JSON.stringify({ error: "You are not allowed to submit this gig review." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
          );
        }
      }

      // Check for duplicate review.
      // Prefer booking-level duplicate detection so users can review the same entity
      // across different bookings/applications.
      let existingReview = null;
      if (bookingId && bookingType === "studio_booking") {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("studio_booking_id", bookingId)
          .maybeSingle();
        existingReview = data;
      } else if (bookingId && bookingType === "gig_application") {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("gig_application_id", bookingId)
          .maybeSingle();
        existingReview = data;
      } else if (studioId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("studio_id", studioId)
          .maybeSingle();
        existingReview = data;
      } else if (gigId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("gig_id", gigId)
          .maybeSingle();
        existingReview = data;
      } else if (groupId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("group_id", groupId)
          .maybeSingle();
        existingReview = data;
      } else if (targetUserId) {
        const { data } = await supabaseClient
          .from("reviews")
          .select("id")
          .eq("author_id", userId)
          .eq("user_id", targetUserId)
          .maybeSingle();
        existingReview = data;
      }

      if (existingReview) {
        return new Response(
          JSON.stringify({
            error: "You have already submitted a review for this entity.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 409,
          },
        );
      }

      // Insert the review
      const reviewData: any = {
        author_id: userId,
        rating,
        content: content || null,
      };

      if (studioId) reviewData.studio_id = studioId;
      if (gigId) reviewData.gig_id = gigId;
      if (groupId) reviewData.group_id = groupId;
      if (targetUserId) reviewData.user_id = targetUserId;
      if (bookingId && bookingType === "studio_booking")
        reviewData.studio_booking_id = bookingId;
      if (bookingId && bookingType === "gig_application")
        reviewData.gig_application_id = bookingId;

      const { data: review, error: reviewError } = await supabaseClient
        .from("reviews")
        .insert(reviewData)
        .select()
        .single();

      if (reviewError) throw reviewError;

      // Update booking reviewed status
      if (bookingId && bookingType === "studio_booking") {
        const updateField =
          reviewerRole === "customer"
            ? "reviewed_by_customer"
            : "reviewed_by_owner";
        await supabaseClient
          .from("studio_bookings")
          .update({ [updateField]: true })
          .eq("id", bookingId);

        // Check if BOTH have reviewed -> mark as completed
        const { data: booking } = await supabaseClient
          .from("studio_bookings")
          .select("reviewed_by_customer, reviewed_by_owner")
          .eq("id", bookingId)
          .single();

        if (booking?.reviewed_by_customer && booking?.reviewed_by_owner) {
          await supabaseClient
            .from("studio_bookings")
            .update({ status: "completed" })
            .eq("id", bookingId);
        }
      } else if (bookingId && bookingType === "gig_application") {
        const updateField =
          reviewerRole === "applicant"
            ? "reviewed_by_applicant"
            : "reviewed_by_organizer";
        await supabaseClient
          .from("gig_applications")
          .update({ [updateField]: true })
          .eq("id", bookingId);
      }

      return new Response(JSON.stringify(review), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201,
      });
    }



    // 6. CHECK REVIEW STATUS (to know if user already reviewed)
    if (action === "check_review_status") {
      const { bookingId, bookingType } = params;

      if (bookingType === "studio_booking") {
        const { data, error } = await supabaseClient
          .from("studio_bookings")
          .select("reviewed_by_customer, reviewed_by_owner, status")
          .eq("id", bookingId)
          .single();

        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        const { data, error } = await supabaseClient
          .from("gig_applications")
          .select("reviewed_by_applicant, reviewed_by_organizer, status")
          .eq("id", bookingId)
          .single();

        if (error) throw error;
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 7. SCAN QR (Create Check-In)
    if (action === "scan_qr") {
      const { qr_code, scanner_id } = params;

      console.log("📷 Scan QR request:", { qr_code, scanner_id });

      // 1. Verify the booking exists and is confirmed
      const { data: booking, error: fetchError } = await supabaseClient
        .from("studio_bookings")
        .select("*, studio:studios(owner_id)")
        .eq("id", qr_code)
        .single();

      console.log("📷 Booking fetch result:", { booking, fetchError });

      if (fetchError) {
        console.error("📷 Fetch error details:", fetchError);
        return new Response(
          JSON.stringify({
            error: "Invalid booking code.",
            details: fetchError.message,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      if (!booking) {
        return new Response(JSON.stringify({ error: "Booking not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // 2. Verify scanner is the studio owner
      console.log("📷 Verifying owner:", {
        studio_owner: booking.studio?.owner_id,
        scanner_id,
      });
      if (!booking.studio || booking.studio.owner_id !== scanner_id) {
        return new Response(
          JSON.stringify({
            error: "You are not authorized to scan for this studio.",
            debug: { studio_owner: booking.studio?.owner_id, scanner_id },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // 3. Verify status
      console.log("📷 Current booking status:", booking.status);
      if (booking.status === "checked_in") {
        return new Response(
          JSON.stringify({ message: "Already checked in!", booking }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (booking.status !== "confirmed") {
        return new Response(
          JSON.stringify({
            error: `Cannot check in. Booking status is ${booking.status}.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // 4. Update status to checked_in
      console.log("📷 Attempting to update booking to checked_in...");
      const { data: updated, error: updateError } = await supabaseClient
        .from("studio_bookings")
        .update({
          status: "checked_in",
          check_in_time: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .select()
        .single();

      if (updateError) {
        console.error("📷 Check-in update error:", updateError);
        return new Response(
          JSON.stringify({
            error: "Failed to update check-in status.",
            details: updateError.message,
            code: updateError.code,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      console.log("📷 Check-in successful:", updated);
      return new Response(JSON.stringify({ success: true, booking: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 8. RENEW CONTRACT (Venue Owner re-hires a musician)
    if (action === "renew_contract") {
      const { application_id, gig_id, applicant_id, organizer_id } = params;

      console.log("🔄 Renew contract request:", {
        application_id,
        gig_id,
        applicant_id,
        organizer_id,
      });

      // 1. Verify the original application exists
      const { data: originalApp, error: fetchError } = await supabaseClient
        .from("gig_applications")
        .select("*, gig:gig_id(name, organizer_id)")
        .eq("id", application_id)
        .single();

      if (fetchError || !originalApp) {
        return new Response(
          JSON.stringify({ error: "Original application not found." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      // 2. Verify the user is the gig organizer
      if (originalApp.gig?.organizer_id !== organizer_id) {
        return new Response(
          JSON.stringify({
            error: "You are not authorized to renew this contract.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // 3. Get the applicant info for the notification
      const { data: applicantProfile } = await supabaseClient
        .from("profiles")
        .select("full_name, email")
        .eq("id", applicant_id)
        .single();

      const applicantName =
        applicantProfile?.full_name || applicantProfile?.email || "Musician";
      const gigName = originalApp.gig?.name || "Gig";

      // 4. Send notification to the musician about the renewal offer
      const { error: notifyError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: applicant_id,
          type: "success",
          title: "Contract Renewal Offer! 🎉",
          message: `Great news! The venue wants to work with you again for "${gigName}". Check the gig listing to apply!`,
          read: false,
          meta: {
            type: "contract_renewal",
            gig_id: gig_id,
            original_application_id: application_id,
            organizer_id: organizer_id,
          },
        });

      if (notifyError) {
        console.error("Error sending renewal notification:", notifyError);
      }

      // 5. Log the renewal for tracking (could be used for analytics later)
      console.log(
        `🔄 Contract renewal sent from ${organizer_id} to ${applicant_id} for gig ${gig_id}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Renewal offer sent to ${applicantName}!`,
          applicant_id,
          gig_id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // 9. CONFIRM PAYMENT (Secure Server-Side Confirmation)
    if (action === "confirm_payment") {
      const { booking_id, payment_intent_id, payment_method_id, amount } = params;

      console.log("💳 Confirm payment requested:", { booking_id, amount });

      if (!booking_id) {
        return new Response(JSON.stringify({ error: "Booking ID is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // 1. Fetch current booking to check status
      const { data: booking, error: fetchError } = await supabaseClient
        .from("studio_bookings")
        .select("id, status, payment_status, payment_type, remaining_balance, final_price, user_id, studio:studios(name)")
        .eq("id", booking_id)
        .single();

      if (fetchError || !booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // 2. Prepare update data
      // If it sends 'confirmed' status, it moves to Upcoming
      const updateData: any = {
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        status: 'confirmed', // Auto-confirm when paid
      };

      // Handle remaining balance logic
      if (booking.payment_type === 'downpayment' && booking.remaining_balance > 0) {
        // Downpayment paid, but balance remains
        // Keep remaining_balance as is (or update if partial payment logic existed, but here we assume the required amount was paid)
      } else {
        // Full payment or Balance payment -> clear balance
        updateData.remaining_balance = 0;
      }

      console.log("💳 Updating booking with:", updateData);

      // 3. Update using Admin client to bypass RLS if necessary (though service role is used here)
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from("studio_bookings")
        .update(updateData)
        .eq("id", booking_id)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Notification error:", updateError);
        return new Response(JSON.stringify({ error: "Failed to update booking status", details: updateError }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      // 4. Send Confirmation Notification to User
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: booking.user_id,
          type: "success",
          title: "Payment Successful! 🎉",
          message: `Your booking at ${booking.studio?.name} has been confirmed.`,
          read: false,
          meta: {
            booking_id: booking.id,
            type: "booking_confirmation"
          }
        });
      } catch (notifyError) {
        console.error("❌ Notification error:", notifyError);
        // Don't fail the request just because notification failed
      }

      return new Response(JSON.stringify({ success: true, booking: updatedBooking }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // CLEAR REMAINING BALANCE (Face-to-Face Payment)
    if (action === "clear_balance") {
      const { booking_id, owner_id, amount } = params;

      if (!booking_id || !owner_id || !amount) {
        return new Response(
          JSON.stringify({ error: "Missing required parameters" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // 1. Get the booking and verify ownership
      const { data: booking, error: bookingError } = await supabaseClient
        .from("studio_bookings")
        .select("*, studio:studios(id, owner_id, name)")
        .eq("id", booking_id)
        .single();

      if (bookingError || !booking) {
        return new Response(
          JSON.stringify({ error: "Booking not found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      // 2. Verify the owner owns this studio
      if (booking.studio?.owner_id !== owner_id) {
        return new Response(
          JSON.stringify({ error: "You are not authorized to modify this booking" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // 3. Verify there's a remaining balance
      if (!booking.remaining_balance || booking.remaining_balance <= 0) {
        return new Response(
          JSON.stringify({ error: "No remaining balance to clear" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const balanceAmount = booking.remaining_balance;

      // 4. Update the booking to clear the balance
      const { error: updateError } = await supabaseClient
        .from("studio_bookings")
        .update({
          remaining_balance: 0,
          payment_status: "paid",
          payment_amount: booking.final_price, // Full amount is now paid
        })
        .eq("id", booking_id);

      if (updateError) {
        console.error("Error updating booking:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to update booking" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      // 5. Credit the owner's wallet
      const { data: wallet, error: walletError } = await supabaseAdmin
        .from("wallets")
        .select("id, balance")
        .eq("user_id", owner_id)
        .single();

      if (walletError) {
        console.error("Wallet fetch error:", walletError);
        // Continue anyway - booking is updated
      }

      if (wallet) {
        // Update wallet balance
        const { error: walletUpdateError } = await supabaseAdmin
          .from("wallets")
          .update({ balance: (wallet.balance || 0) + balanceAmount })
          .eq("id", wallet.id);

        if (walletUpdateError) {
          console.error("Wallet update error:", walletUpdateError);
        }

        // Create transaction record
        const { error: transactionError } = await supabaseAdmin
          .from("wallet_transactions")
          .insert({
            wallet_id: wallet.id,
            amount: balanceAmount,
            type: "credit",
            description: `F2F payment collected - ${booking.studio?.name || "Studio"}`,
            status: "completed",
            meta: {
              booking_id: booking_id,
              payment_method: "face_to_face",
              studio_name: booking.studio?.name,
            },
          });

        if (transactionError) {
          console.error("Transaction record error:", transactionError);
        }
      }

      // 6. Notify the customer that their balance was cleared
      const { error: notifyError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: booking.user_id,
          type: "success",
          title: "Balance Cleared! ✅",
          message: `Your remaining balance of ₱${balanceAmount.toLocaleString()} for ${booking.studio?.name || "your booking"} has been marked as paid.`,
          read: false,
          meta: {
            type: "balance_cleared",
            booking_id: booking_id,
            amount: balanceAmount,
          },
        });

      if (notifyError) {
        console.error("Notification error:", notifyError);
      }

      console.log(
        `💵 Balance cleared: ₱${balanceAmount} for booking ${booking_id} by owner ${owner_id}`,
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Balance of ₱${balanceAmount.toLocaleString()} cleared successfully`,
          amount: balanceAmount,
          booking_id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
