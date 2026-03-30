import { useCallback, useEffect, useState } from "react";
import {
    IoCalendar,
    IoCheckmarkCircle,
    IoCloseCircle,
    IoHourglass,
  IoShieldCheckmark,
    IoTimeOutline,
} from "react-icons/io5";
import { useSearchParams } from "react-router-dom";
import GuestSignInGate from "../components/GuestSignInGate";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Booking {
  id: string;
  status: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  total_amount: number;
  remaining_balance: number;
  studio?: { name: string; images?: string[] };
  user?: { full_name: string; avatar_url?: string };
}

interface PermitSubmission {
  id: string;
  name: string;
  permit_status: string;
  permit_rejection_reason?: string | null;
  created_at: string;
  type: "studio" | "gig";
}

const statusConfig: Record<
  string,
  { color: string; bg: string; Icon: React.ComponentType<any>; label: string }
> = {
  pending: {
    color: "#F59E0B",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    Icon: IoHourglass,
    label: "Pending",
  },
  confirmed: {
    color: "#3B82F6",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    Icon: IoCheckmarkCircle,
    label: "Confirmed",
  },
  completed: {
    color: "#10B981",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    Icon: IoCheckmarkCircle,
    label: "Completed",
  },
  cancelled: {
    color: "#EF4444",
    bg: "bg-red-50 dark:bg-red-900/20",
    Icon: IoCloseCircle,
    label: "Cancelled",
  },
};

type TabType = "pending" | "upcoming" | "past" | "cancelled";

export default function BookingsPage() {
  const { colors, isDark } = useTheme();
  const { session, isGuest, userRole } = useAuth();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [permitSubmissions, setPermitSubmissions] = useState<PermitSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");

  const isOwner = userRole === "studio-owner" || userRole === "venue-owner";
  const requestedTab = (searchParams.get("tab") || "").toLowerCase();

  useEffect(() => {
    if (requestedTab === "pending" && !isOwner) return;
    if (["pending", "upcoming", "past", "cancelled"].includes(requestedTab)) {
      setActiveTab(requestedTab as TabType);
    } else if (isOwner) {
      setActiveTab("pending");
    }
  }, [requestedTab, isOwner]);

  const fetchBookings = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      let query = supabase
        .from("studio_bookings")
        .select(
          "*, studio:studios(name, images), user:profiles!studio_bookings_user_id_fkey(full_name, avatar_url)",
        )
        .order("booking_date", { ascending: false });

      if (userRole === "studio-owner") {
        const { data: ownedStudios, error: studioOwnerError } = await supabase
          .from("studios")
          .select("id")
          .eq("owner_id", session.user.id);

        if (studioOwnerError) throw studioOwnerError;

        const studioIds = (ownedStudios || []).map((studio) => studio.id);
        if (studioIds.length === 0) {
          setBookings([]);
        } else {
          query = query.in("studio_id", studioIds);
          const { data, error } = await query;
          if (!error && data) {
            setBookings(data as unknown as Booking[]);
          }
        }
      } else {
        query = query.eq("user_id", session.user.id);
        const { data, error } = await query;
        if (!error && data) {
          setBookings(data as unknown as Booking[]);
        }
      }

      if (userRole === "studio-owner") {
        const { data, error } = await supabase
          .from("studios")
          .select("id, name, permit_status, permit_rejection_reason, created_at")
          .eq("owner_id", session.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        setPermitSubmissions(
          (data || []).map((item) => ({
            id: item.id,
            name: item.name,
            permit_status: item.permit_status || "pending_review",
            permit_rejection_reason: item.permit_rejection_reason,
            created_at: item.created_at,
            type: "studio",
          })),
        );
      } else if (userRole === "venue-owner") {
        const { data, error } = await supabase
          .from("gigs")
          .select("id, name, permit_status, permit_rejection_reason, created_at")
          .eq("organizer_id", session.user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        setPermitSubmissions(
          (data || []).map((item) => ({
            id: item.id,
            name: item.name,
            permit_status: item.permit_status || "pending_review",
            permit_rejection_reason: item.permit_rejection_reason,
            created_at: item.created_at,
            type: "gig",
          })),
        );
      } else {
        setPermitSubmissions([]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, userRole]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Realtime updates
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel("bookings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studio_bookings" },
        () => fetchBookings(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, fetchBookings]);

  const filteredBookings = bookings.filter((b) => {
    const bookingDate = new Date(b.booking_date);
    const now = new Date();
    if (activeTab === "pending") return b.status === "pending";
    if (activeTab === "upcoming")
      return bookingDate >= now && b.status !== "cancelled";
    if (activeTab === "past")
      return bookingDate < now && b.status !== "cancelled";
    return b.status === "cancelled";
  });

  const pendingPermitSubmissions = permitSubmissions.filter((item) => {
    const status = (item.permit_status || "").toLowerCase();
    return status !== "approved";
  });

  const permitStatusChip = (status: string) => {
    if (status === "approved") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (status === "rejected") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (status === "resubmitted") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  };

  const statusLabel = (status: string) => {
    if ((status || "").toLowerCase() === "pending") return "pending review";
    return (status || "pending_review").replace("_", " ");
  };

  const tabs: TabType[] = isOwner
    ? ["pending", "upcoming", "past", "cancelled"]
    : ["upcoming", "past", "cancelled"];

  if (isGuest) {
    return (
      <div className="page-container">
        <Header title="Bookings" />
        <GuestSignInGate message="Sign in to view your bookings" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <Header title="Bookings" />

      <div className="content-container pb-32">
        {/* Tabs */}
        <div
          className="mb-6 flex rounded-xl border p-1"
          style={{
            borderColor: colors.border,
            backgroundColor: colors.inputBackground,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg py-3 text-sm font-semibold capitalize transition-all ${
                activeTab === tab
                  ? "bg-white text-indigo-600 shadow-sm dark:bg-slate-700 dark:text-indigo-400"
                  : ""
              }`}
              style={{
                color:
                  activeTab === tab ? colors.primary : colors.textSecondary,
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="spinner"
              style={{ color: colors.primary, width: 32, height: 32 }}
            />
          </div>
        ) : filteredBookings.length === 0 && !(activeTab === "pending" && isOwner && pendingPermitSubmissions.length > 0) ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <IoCalendar size={48} color={colors.muted} className="mb-4" />
            <p
              className="text-lg font-semibold mb-1"
              style={{ color: colors.text }}
            >
              No {activeTab} items
            </p>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {activeTab === "pending"
                ? "Pending bookings and permit submissions will appear here"
                : activeTab === "upcoming"
                ? "Your upcoming bookings will appear here"
                : `Your ${activeTab} bookings will appear here`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === "pending" && isOwner && pendingPermitSubmissions.map((permit) => (
              <div
                key={`permit-${permit.type}-${permit.id}`}
                className="card border-l-4"
                style={{ borderLeftColor: colors.primary }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                      Permit Queue
                    </p>
                    <h3 className="text-base font-semibold" style={{ color: colors.text }}>
                      {permit.name}
                    </h3>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                      {permit.type === "studio" ? "Studio" : "Gig"} submitted on {new Date(permit.created_at).toLocaleDateString("en-PH")}
                    </p>
                    {permit.permit_rejection_reason && (
                      <p className="text-xs mt-1 text-red-500">
                        Rejection reason: {permit.permit_rejection_reason}
                      </p>
                    )}
                  </div>
                  <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${permitStatusChip(permit.permit_status)}`}>
                    <IoShieldCheckmark size={11} />
                    {statusLabel(permit.permit_status)}
                  </span>
                </div>
              </div>
            ))}

            {filteredBookings.map((booking) => {
              const config =
                statusConfig[booking.status] || statusConfig.pending;
              return (
                <div
                  key={booking.id}
                  className="card flex gap-4 transition-all hover:shadow-md cursor-pointer"
                >
                  {/* Studio image */}
                  <div className="hidden sm:block h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-slate-700">
                    {booking.studio?.images?.[0] ? (
                      <img
                        src={booking.studio.images[0]}
                        alt={booking.studio.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <IoCalendar size={24} color={colors.muted} />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3
                        className="truncate text-base font-semibold"
                        style={{ color: colors.text }}
                      >
                        {booking.studio?.name || "Studio Booking"}
                      </h3>
                      <span
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${config.bg}`}
                        style={{ color: config.color }}
                      >
                        <config.Icon size={12} />
                        {config.label}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span
                        className="flex items-center gap-1.5 text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        <IoCalendar size={14} />
                        {new Date(booking.booking_date).toLocaleDateString(
                          "en-PH",
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        <IoTimeOutline size={14} />
                        {booking.start_time?.slice(0, 5)} –{" "}
                        {booking.end_time?.slice(0, 5)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className="text-sm font-bold"
                        style={{ color: colors.primary }}
                      >
                        ₱{booking.total_amount?.toLocaleString()}
                      </span>
                      {booking.remaining_balance > 0 && (
                        <span className="text-[10px] font-medium text-amber-500">
                          ₱{booking.remaining_balance.toLocaleString()}{" "}
                          remaining
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
