import { useCallback, useEffect, useState } from "react";
import {
  IoCheckmarkCircle,
  IoChevronBack,
  IoCloseCircle,
  IoDocumentTextOutline,
  IoEyeOutline,
  IoFunnelOutline,
  IoPeopleOutline,
  IoPersonOutline,
  IoSearchOutline,
  IoShieldCheckmarkOutline,
  IoStatsChartOutline,
  IoTimeOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

type Tab = "dashboard" | "permits" | "users" | "reports" | "audit";
type PermitFilter = "all" | "pending_review" | "approved" | "rejected" | "resubmitted";
type EntityFilter = "all" | "studio" | "gig";
type ReportFilter = "all" | "pending" | "resolved" | "dismissed";
type BookingIncidentFilter =
  | "all"
  | "open"
  | "responded"
  | "manual_review"
  | "resolved_refund"
  | "resolved_no_refund"
  | "dismissed";
type BookingIncidentResolution = "resolved_refund" | "resolved_no_refund" | "dismissed";

interface PermitItem {
  id: string;
  name: string;
  entity_type: "studio" | "gig";
  permit_status: string;
  business_permit_url: string | null;
  owner_name: string;
  owner_email: string;
  owner_id: string;
  created_at: string;
  permit_reviewed_at: string | null;
  permit_rejection_reason: string | null;
  permit_admin_notes: string | null;
}

interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  performed_by: string;
  rejection_reason: string | null;
  admin_notes: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  performer_name?: string;
  entity_name?: string;
}

interface UserEntry {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_verified: boolean;
  created_at: string;
  avatar_url: string | null;
}

interface ReportEntry {
  id: string;
  reporter_id: string | null;
  reporter_name: string;
  reporter_email: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

interface BookingIncidentEntry {
  id: string;
  booking_id: string;
  issue_type: string;
  status: string;
  reporter_notes: string | null;
  counterparty_notes: string | null;
  response_deadline_at: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  reporter_name: string;
  reporter_email: string;
  counterparty_name: string;
  counterparty_email: string;
  studio_name: string | null;
  booking_date: string | null;
  booking_start_time: string | null;
  booking_end_time: string | null;
}

interface DashboardMetrics {
  totalUsers: number;
  totalStudios: number;
  totalGigs: number;
  pendingPermits: number;
  approvedPermits: number;
  rejectedPermits: number;
  recentActions: number;
}

export default function AdminDashboard() {
  const { colors, isDark } = useTheme();
  const { isAdmin, user, session, roleResolved } = useAuth();
  const navigate = useNavigate();

  const getAuthHeaders = useCallback(() => {
    const token = session?.access_token;
    if (!token) return undefined;
    return { Authorization: `Bearer ${token}` };
  }, [session?.access_token]);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);

  // Dashboard metrics
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalUsers: 0,
    totalStudios: 0,
    totalGigs: 0,
    pendingPermits: 0,
    approvedPermits: 0,
    rejectedPermits: 0,
    recentActions: 0,
  });

  // Permits
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [permitFilter, setPermitFilter] = useState<PermitFilter>("all");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [permitSearch, setPermitSearch] = useState("");
  const [permitLoading, setPermitLoading] = useState(false);

  // Review modal
  const [reviewItem, setReviewItem] = useState<PermitItem | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);

  // Permit preview modal
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userLoading, setUserLoading] = useState(false);

  // Reports
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [reportFilter, setReportFilter] = useState<ReportFilter>("all");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportActionLoading, setReportActionLoading] = useState<string | null>(null);

  // Booking incident queue
  const [bookingIncidents, setBookingIncidents] = useState<BookingIncidentEntry[]>([]);
  const [incidentFilter, setIncidentFilter] =
    useState<BookingIncidentFilter>("all");
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentActionLoading, setIncidentActionLoading] =
    useState<string | null>(null);

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Alert
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  // Redirect non-admins
  useEffect(() => {
    if (!roleResolved) return;

    if (!isAdmin) {
      setLoading(false);
      navigate("/home", { replace: true });
    }
  }, [isAdmin, roleResolved, navigate]);

  // Fetch dashboard metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "permit-management",
        {
          body: { action: "fetch_metrics" },
          headers: getAuthHeaders(),
        },
      );

      if (error) throw error;

      setMetrics({
        totalUsers: data?.totalUsers || 0,
        totalStudios: data?.totalStudios || 0,
        totalGigs: data?.totalGigs || 0,
        pendingPermits: data?.pendingPermits || 0,
        approvedPermits: data?.approvedPermits || 0,
        rejectedPermits: data?.rejectedPermits || 0,
        recentActions: data?.recentActions || 0,
      });
    } catch (err) {
      console.error("Error fetching metrics:", err);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!roleResolved || !isAdmin || !session?.access_token) return;

    fetchMetrics();
  }, [fetchMetrics, roleResolved, isAdmin, session?.access_token]);

  // Fetch permit queue
  const fetchPermits = useCallback(async () => {
    setPermitLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "permit-management",
        {
          body: {
            action: "fetch_queue",
            entityType: entityFilter,
            permitStatus: permitFilter,
          },
          headers: getAuthHeaders(),
        },
      );

      if (error) throw error;

      setPermits(data?.items || []);
    } catch (err) {
      console.error("Error fetching permits:", err);
    } finally {
      setPermitLoading(false);
    }
  }, [permitFilter, entityFilter, getAuthHeaders]);

  useEffect(() => {
    if (tab === "permits") fetchPermits();
  }, [tab, fetchPermits]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_verified, created_at, avatar_url")
        .order("created_at", { ascending: false })
        .limit(100);
      if (data) setUsers(data);
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "users") fetchUsers();
  }, [tab, fetchUsers]);

  useEffect(() => {
    if (tab === "reports" && users.length === 0) fetchUsers();
  }, [tab, users.length, fetchUsers]);

  // Fetch reports
  const fetchReports = useCallback(async () => {
    setReportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "admin-reports-management",
        {
          body: {
            action: "fetch_reports",
            statusFilter: reportFilter,
            limit: 100,
          },
          headers: getAuthHeaders(),
        },
      );

      if (error) throw error;

      setReports(data?.items || []);
    } catch (err) {
      console.error("Error fetching reports:", err);
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to load reports.",
      });
    } finally {
      setReportLoading(false);
    }
  }, [reportFilter, getAuthHeaders]);

  useEffect(() => {
    if (tab === "reports") fetchReports();
  }, [tab, fetchReports]);

  // Fetch booking incidents
  const fetchBookingIncidents = useCallback(async () => {
    setIncidentLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-bookings",
        {
          body: {
            action: "admin_fetch_booking_incidents",
            statusFilter: incidentFilter,
            limit: 100,
          },
          headers: getAuthHeaders(),
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setBookingIncidents(data?.items || []);
    } catch (err: any) {
      console.error("Error fetching booking incidents:", err);
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message:
          err?.message || "Failed to load booking incidents queue.",
      });
    } finally {
      setIncidentLoading(false);
    }
  }, [incidentFilter, getAuthHeaders]);

  useEffect(() => {
    if (tab === "reports") fetchBookingIncidents();
  }, [tab, fetchBookingIncidents]);

  const updateReportStatus = async (reportId: string, nextStatus: "resolved" | "dismissed") => {
    setReportActionLoading(reportId);
    try {
      const { error } = await supabase.functions.invoke("admin-reports-management", {
        body: {
          action: "update_report_status",
          reportId,
          nextStatus,
        },
        headers: getAuthHeaders(),
      });

      if (error) throw error;

      setAlert({
        visible: true,
        type: "success",
        title: "Updated",
        message: `Report marked as ${nextStatus}.`,
      });
      fetchReports();
    } catch (err) {
      console.error("Error updating report status:", err);
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to update report status.",
      });
    } finally {
      setReportActionLoading(null);
    }
  };

  const resolveBookingIncident = async (
    incidentId: string,
    resolution: BookingIncidentResolution,
  ) => {
    setIncidentActionLoading(incidentId);
    try {
      const { data, error } = await supabase.functions.invoke(
        "manage-bookings",
        {
          body: {
            action: "admin_resolve_booking_incident",
            incident_id: incidentId,
            resolution,
          },
          headers: getAuthHeaders(),
        },
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAlert({
        visible: true,
        type: "success",
        title: "Incident Updated",
        message: `Incident marked as ${resolution.replace(/_/g, " ")}.`,
      });

      fetchBookingIncidents();
    } catch (err: any) {
      console.error("Error resolving booking incident:", err);
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message:
          err?.message || "Failed to resolve booking incident.",
      });
    } finally {
      setIncidentActionLoading(null);
    }
  };

  // Fetch audit log
  const fetchAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "permit-management",
        {
          body: {
            action: "fetch_audit",
            limit: 100,
          },
          headers: getAuthHeaders(),
        },
      );

      if (error) throw error;

      setAuditLog(
        (data?.items || []).map((entry: any) => ({
          ...entry,
          performer_name: entry.performer_name || entry.performer?.full_name || "System",
          entity_name: entry.metadata?.entity_name || entry.entity_id,
        })),
      );
    } catch (err) {
      console.error("Error fetching audit log:", err);
    } finally {
      setAuditLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (tab === "audit") fetchAuditLog();
  }, [tab, fetchAuditLog]);

  // Handle permit review
  const handleReview = async () => {
    if (!reviewItem || !reviewAction || !user) return;
    if (reviewAction === "reject" && !rejectReason.trim()) {
      setAlert({ visible: true, type: "error", title: "Required", message: "Rejection reason is required." });
      return;
    }

    setReviewLoading(true);
    try {
      const { error } = await supabase.functions.invoke("permit-management", {
        body: {
          action: "review_permit",
          entityType: reviewItem.entity_type,
          entityId: reviewItem.id,
          reviewAction,
          rejectionReason: reviewAction === "reject" ? rejectReason : "",
          adminNotes,
        },
        headers: getAuthHeaders(),
      });

      if (error) throw error;

      setAlert({
        visible: true,
        type: "success",
        title: reviewAction === "approve" ? "Approved" : "Rejected",
        message: `${reviewItem.name} has been ${reviewAction === "approve" ? "approved" : "rejected"}.`,
      });

      // Reset and refresh
      setReviewItem(null);
      setReviewAction(null);
      setRejectReason("");
      setAdminNotes("");
      fetchPermits();
      fetchMetrics();
    } catch (err) {
      setAlert({ visible: true, type: "error", title: "Error", message: "Failed to update permit status." });
    } finally {
      setReviewLoading(false);
    }
  };

  const filteredPermits = permits.filter((p) => {
    if (!permitSearch) return true;
    const q = permitSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.owner_name.toLowerCase().includes(q) ||
      p.owner_email.toLowerCase().includes(q)
    );
  });

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const borderCol = isDark ? "#374151" : "#E5E7EB";
  const cardBg = isDark ? "#1F2937" : "#FFFFFF";

  const statusChip = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      pending_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      resubmitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    };
    return map[status] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  };

  const formatPermitStatus = (status: string) => {
    if (status === "pending") return "pending review";
    return (status || "pending_review").replace("_", " ");
  };

  const roleChip = (role: string) => {
    const map: Record<string, string> = {
      admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
      musician: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      "studio-owner": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
      "venue-owner": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      manager: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      "musician-member": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    };
    return map[role] || "bg-gray-100 text-gray-700";
  };

  const actionChip = (action: string) => {
    const map: Record<string, string> = {
      submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      resubmitted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    };
    return map[action] || "bg-gray-100 text-gray-700";
  };

  const reportStatusChip = (status: string) => {
    const map: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      resolved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      dismissed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    };
    return map[status] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  };

  const incidentStatusChip = (status: string) => {
    const map: Record<string, string> = {
      open: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      responded: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      manual_review: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      resolved_refund: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      resolved_no_refund: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      dismissed: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
    };
    return map[status] || "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  };

  const formatIncidentIssue = (issueType: string) =>
    String(issueType || "issue").replace(/_/g, " ");

  const isIncidentActionable = (status: string) =>
    ["open", "responded", "manual_review"].includes(status);

  const fmtDate = (d: string) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const tabs: { id: Tab; label: string; icon: typeof IoStatsChartOutline }[] = [
    { id: "dashboard", label: "Dashboard", icon: IoStatsChartOutline },
    { id: "permits", label: "Permits", icon: IoDocumentTextOutline },
    { id: "users", label: "Users", icon: IoPeopleOutline },
    { id: "reports", label: "Reports", icon: IoShieldCheckmarkOutline },
    { id: "audit", label: "Audit Log", icon: IoTimeOutline },
  ];

  if (loading || !roleResolved) {
    return (
      <div className="page-container">
        <div className="flex items-center justify-center py-32">
          <span className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="content-container max-w-7xl pt-6 pb-32">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
              Admin Dashboard
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Manage permits, users, and platform settings
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : isDark
                    ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <t.icon size={16} />
              {t.label}
              {t.id === "permits" && metrics.pendingPermits > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {metrics.pendingPermits}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {tab === "dashboard" && (
          <div className="space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Users", value: metrics.totalUsers, icon: IoPeopleOutline, color: "text-blue-500", bg: isDark ? "bg-blue-900/20" : "bg-blue-50" },
                { label: "Studios", value: metrics.totalStudios, icon: IoDocumentTextOutline, color: "text-purple-500", bg: isDark ? "bg-purple-900/20" : "bg-purple-50" },
                { label: "Gigs", value: metrics.totalGigs, icon: IoDocumentTextOutline, color: "text-emerald-500", bg: isDark ? "bg-emerald-900/20" : "bg-emerald-50" },
                { label: "Audit Actions", value: metrics.recentActions, icon: IoTimeOutline, color: "text-orange-500", bg: isDark ? "bg-orange-900/20" : "bg-orange-50" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border p-4"
                  style={{ backgroundColor: cardBg, borderColor: borderCol }}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.bg} mb-2`}>
                    <stat.icon size={18} className={stat.color} />
                  </div>
                  <p className="text-2xl font-bold" style={{ color: colors.text }}>
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Permit Status Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <button
                onClick={() => { setPermitFilter("pending_review"); setTab("permits"); }}
                className="rounded-2xl border p-5 text-left transition hover:shadow-md"
                style={{ backgroundColor: cardBg, borderColor: borderCol }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-yellow-900/20" : "bg-yellow-50"}`}>
                    <IoTimeOutline size={20} className="text-yellow-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: colors.text }}>{metrics.pendingPermits}</p>
                    <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Pending Review</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setPermitFilter("approved"); setTab("permits"); }}
                className="rounded-2xl border p-5 text-left transition hover:shadow-md"
                style={{ backgroundColor: cardBg, borderColor: borderCol }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-green-900/20" : "bg-green-50"}`}>
                    <IoCheckmarkCircle size={20} className="text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: colors.text }}>{metrics.approvedPermits}</p>
                    <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Approved</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setPermitFilter("rejected"); setTab("permits"); }}
                className="rounded-2xl border p-5 text-left transition hover:shadow-md"
                style={{ backgroundColor: cardBg, borderColor: borderCol }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDark ? "bg-red-900/20" : "bg-red-50"}`}>
                    <IoCloseCircle size={20} className="text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" style={{ color: colors.text }}>{metrics.rejectedPermits}</p>
                    <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>Rejected</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Permits Tab */}
        {tab === "permits" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div
                className="flex flex-1 max-w-md items-center gap-2 rounded-xl border px-4 py-2.5"
                style={{ backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }}
              >
                <IoSearchOutline size={16} color={colors.textSecondary} />
                <input
                  type="text"
                  placeholder="Search by name, owner..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: colors.text }}
                  value={permitSearch}
                  onChange={(e) => setPermitSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <IoFunnelOutline size={16} color={colors.textSecondary} />
                <select
                  value={permitFilter}
                  onChange={(e) => setPermitFilter(e.target.value as PermitFilter)}
                  className="rounded-lg border px-3 py-2 text-sm bg-transparent"
                  style={{ color: colors.text, borderColor: borderCol }}
                >
                  <option value="all">All Status</option>
                  <option value="pending_review">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="resubmitted">Resubmitted</option>
                </select>
                <select
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value as EntityFilter)}
                  className="rounded-lg border px-3 py-2 text-sm bg-transparent"
                  style={{ color: colors.text, borderColor: borderCol }}
                >
                  <option value="all">All Types</option>
                  <option value="studio">Studios</option>
                  <option value="gig">Gigs</option>
                </select>
              </div>
            </div>

            {/* Permit List */}
            {permitLoading ? (
              <div className="flex justify-center py-12"><span className="spinner" /></div>
            ) : filteredPermits.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  No permits found.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPermits.map((item) => (
                  <div
                    key={`${item.entity_type}-${item.id}`}
                    className="rounded-2xl border p-4 transition hover:shadow-md"
                    style={{ backgroundColor: cardBg, borderColor: borderCol }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.entity_type === "studio" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                            {item.entity_type}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip(item.permit_status)}`}>
                            {formatPermitStatus(item.permit_status)}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold truncate" style={{ color: colors.text }}>
                          {item.name}
                        </h3>
                        <div className="flex items-center gap-1 mt-0.5">
                          <IoPersonOutline size={12} color={colors.textSecondary} />
                          <span className="text-xs" style={{ color: colors.textSecondary }}>
                            {item.owner_name} ({item.owner_email})
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: colors.muted }}>
                          Created: {fmtDate(item.created_at)}
                          {item.permit_reviewed_at && ` | Reviewed: ${fmtDate(item.permit_reviewed_at)}`}
                        </p>
                        {item.permit_rejection_reason && (
                          <p className="text-xs mt-1 text-red-500">
                            Reason: {item.permit_rejection_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.business_permit_url && (
                          <button
                            onClick={() => setPreviewUrl(item.business_permit_url)}
                            className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition hover:bg-gray-50 dark:hover:bg-slate-700"
                            style={{ borderColor: borderCol, color: colors.text }}
                          >
                            <IoEyeOutline size={14} />
                            View Permit
                          </button>
                        )}
                        {(item.permit_status === "pending_review" || item.permit_status === "pending" || item.permit_status === "resubmitted") && (
                          <>
                            <button
                              onClick={() => { setReviewItem(item); setReviewAction("approve"); setAdminNotes(""); }}
                              className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600 transition"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => { setReviewItem(item); setReviewAction("reject"); setRejectReason(""); setAdminNotes(""); }}
                              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div className="space-y-4">
            <div
              className="flex max-w-md items-center gap-2 rounded-xl border px-4 py-2.5"
              style={{ backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }}
            >
              <IoSearchOutline size={16} color={colors.textSecondary} />
              <input
                type="text"
                placeholder="Search users..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: colors.text }}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            {userLoading ? (
              <div className="flex justify-center py-12"><span className="spinner" /></div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: borderCol }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: isDark ? "#1E293B" : "#F9FAFB" }}>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: colors.textSecondary }}>User</th>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: colors.textSecondary }}>Role</th>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: colors.textSecondary }}>Verified</th>
                      <th className="px-4 py-3 text-left font-semibold" style={{ color: colors.textSecondary }}>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr
                        key={u.id}
                        className="border-t transition hover:bg-gray-50 dark:hover:bg-slate-800"
                        style={{ borderColor: borderCol }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.full_name || "?")}&background=6366F1&color=fff`}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                            <div>
                              <p className="font-medium" style={{ color: colors.text }}>{u.full_name || "—"}</p>
                              <p className="text-xs" style={{ color: colors.textSecondary }}>{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleChip(u.role)}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.is_verified ? (
                            <IoCheckmarkCircle size={18} className="text-green-500" />
                          ) : (
                            <IoCloseCircle size={18} className="text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: colors.textSecondary }}>
                          {fmtDate(u.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {tab === "reports" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Permit Status Distribution */}
              <div className="rounded-2xl border p-6" style={{ backgroundColor: cardBg, borderColor: borderCol }}>
                <h3 className="text-base font-semibold mb-4" style={{ color: colors.text }}>Permit Status Distribution</h3>
                <div className="space-y-3">
                  {[
                    { label: "Pending Review", value: metrics.pendingPermits, color: "bg-yellow-500" },
                    { label: "Approved", value: metrics.approvedPermits, color: "bg-green-500" },
                    { label: "Rejected", value: metrics.rejectedPermits, color: "bg-red-500" },
                  ].map((item) => {
                    const total = metrics.pendingPermits + metrics.approvedPermits + metrics.rejectedPermits;
                    const pct = total > 0 ? (item.value / total) * 100 : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm" style={{ color: colors.text }}>{item.label}</span>
                          <span className="text-sm font-medium" style={{ color: colors.text }}>{item.value} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#374151" : "#E5E7EB" }}>
                          <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* User Role Distribution */}
              <div className="rounded-2xl border p-6" style={{ backgroundColor: cardBg, borderColor: borderCol }}>
                <h3 className="text-base font-semibold mb-4" style={{ color: colors.text }}>User Role Distribution</h3>
                <div className="space-y-3">
                  {(() => {
                    const roleCounts: Record<string, number> = {};
                    users.forEach((u) => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });
                    const total = users.length || 1;
                    const roleColors: Record<string, string> = {
                      musician: "bg-blue-500", "studio-owner": "bg-indigo-500", "venue-owner": "bg-emerald-500",
                      admin: "bg-purple-500", manager: "bg-orange-500", "musician-member": "bg-cyan-500",
                    };
                    return Object.entries(roleCounts).map(([role, count]) => (
                      <div key={role}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm" style={{ color: colors.text }}>{role}</span>
                          <span className="text-sm font-medium" style={{ color: colors.text }}>{count}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? "#374151" : "#E5E7EB" }}>
                          <div className={`h-full rounded-full ${roleColors[role] || "bg-gray-500"} transition-all`} style={{ width: `${(count / total) * 100}%` }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Platform Stats */}
            <div className="rounded-2xl border p-6" style={{ backgroundColor: cardBg, borderColor: borderCol }}>
              <h3 className="text-base font-semibold mb-4" style={{ color: colors.text }}>Platform Overview</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold" style={{ color: colors.primary }}>{metrics.totalStudios}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Total Studios</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold" style={{ color: colors.primary }}>{metrics.totalGigs}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Total Gigs</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold" style={{ color: colors.primary }}>{metrics.totalUsers}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Total Users</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold" style={{ color: colors.primary }}>{metrics.recentActions}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Audit Actions</p>
                </div>
              </div>
            </div>

            {/* Reports Queue */}
            <div className="rounded-2xl border p-6" style={{ backgroundColor: cardBg, borderColor: borderCol }}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold" style={{ color: colors.text }}>
                  Reports Queue
                </h3>
                <select
                  value={reportFilter}
                  onChange={(e) => setReportFilter(e.target.value as ReportFilter)}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                    color: colors.text,
                  }}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>

              {reportLoading ? (
                <div className="flex justify-center py-10">
                  <span className="spinner" />
                </div>
              ) : reports.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    No reports found for this filter.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-xl border p-4"
                      style={{ borderColor: borderCol, backgroundColor: isDark ? "#111827" : "#F9FAFB" }}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${reportStatusChip(report.status)}`}>
                              {report.status}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {report.target_type}
                            </span>
                          </div>
                          <p className="text-sm font-semibold" style={{ color: colors.text }}>
                            {report.reason}
                          </p>
                          {report.details && (
                            <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
                              {report.details}
                            </p>
                          )}
                          <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                            Reporter: {report.reporter_name || "Unknown"} ({report.reporter_email || "no email"})
                          </p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            Target ID: {report.target_id}
                          </p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            Created: {fmtDate(report.created_at)}
                          </p>
                        </div>

                        {report.status === "pending" && (
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => updateReportStatus(report.id, "resolved")}
                              disabled={reportActionLoading === report.id}
                              className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-600 disabled:opacity-60"
                            >
                              Resolve
                            </button>
                            <button
                              onClick={() => updateReportStatus(report.id, "dismissed")}
                              disabled={reportActionLoading === report.id}
                              className="rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

              {/* Booking Incident Queue */}
              <div className="rounded-2xl border p-6" style={{ backgroundColor: cardBg, borderColor: borderCol }}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-base font-semibold" style={{ color: colors.text }}>
                    Booking Incident Queue
                  </h3>
                  <select
                    value={incidentFilter}
                    onChange={(e) => setIncidentFilter(e.target.value as BookingIncidentFilter)}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                      color: colors.text,
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="responded">Responded</option>
                    <option value="manual_review">Manual Review</option>
                    <option value="resolved_refund">Resolved (Refund)</option>
                    <option value="resolved_no_refund">Resolved (No Refund)</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>

                {incidentLoading ? (
                  <div className="flex justify-center py-10">
                    <span className="spinner" />
                  </div>
                ) : bookingIncidents.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      No booking incidents found for this filter.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookingIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className="rounded-xl border p-4"
                        style={{ borderColor: borderCol, backgroundColor: isDark ? "#111827" : "#F9FAFB" }}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${incidentStatusChip(incident.status)}`}>
                                {incident.status.replace(/_/g, " ")}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {formatIncidentIssue(incident.issue_type)}
                              </span>
                            </div>

                            <p className="text-sm font-semibold" style={{ color: colors.text }}>
                              {incident.studio_name || "Studio booking"}
                            </p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                              Booking: {incident.booking_date || "-"}
                              {incident.booking_start_time
                                ? ` ${String(incident.booking_start_time).slice(0, 5)}`
                                : ""}
                              {incident.booking_end_time
                                ? ` - ${String(incident.booking_end_time).slice(0, 5)}`
                                : ""}
                            </p>

                            <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                              Reporter: {incident.reporter_name} ({incident.reporter_email || "no email"})
                            </p>
                            <p className="text-xs" style={{ color: colors.textSecondary }}>
                              Counterparty: {incident.counterparty_name} ({incident.counterparty_email || "no email"})
                            </p>

                            {incident.reporter_notes && (
                              <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
                                <span className="font-semibold" style={{ color: colors.text }}>Reporter note:</span> {incident.reporter_notes}
                              </p>
                            )}

                            {incident.counterparty_notes && (
                              <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
                                <span className="font-semibold" style={{ color: colors.text }}>Counterparty note:</span> {incident.counterparty_notes}
                              </p>
                            )}

                            {incident.resolution && (
                              <p className="mt-1 text-sm" style={{ color: colors.textSecondary }}>
                                <span className="font-semibold" style={{ color: colors.text }}>Resolution:</span> {incident.resolution}
                              </p>
                            )}

                            <p className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                              Created: {fmtDate(incident.created_at)}
                              {incident.response_deadline_at
                                ? ` · Response deadline: ${fmtDate(incident.response_deadline_at)}`
                                : ""}
                            </p>
                          </div>

                          {isIncidentActionable(incident.status) && (
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <button
                                onClick={() => resolveBookingIncident(incident.id, "resolved_no_refund")}
                                disabled={incidentActionLoading === incident.id}
                                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
                              >
                                Resolve (No Refund)
                              </button>
                              <button
                                onClick={() => resolveBookingIncident(incident.id, "resolved_refund")}
                                disabled={incidentActionLoading === incident.id}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                              >
                                Resolve (Refund)
                              </button>
                              <button
                                onClick={() => resolveBookingIncident(incident.id, "dismissed")}
                                disabled={incidentActionLoading === incident.id}
                                className="rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600 disabled:opacity-60"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
          </div>
        )}

        {/* Audit Log Tab */}
        {tab === "audit" && (
          <div className="space-y-3">
            {auditLoading ? (
              <div className="flex justify-center py-12"><span className="spinner" /></div>
            ) : auditLog.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color: colors.textSecondary }}>No audit entries yet.</p>
              </div>
            ) : (
              auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: cardBg, borderColor: borderCol }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${actionChip(entry.action)}`}>
                      {entry.action}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${entry.entity_type === "studio" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                      {entry.entity_type}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: colors.text }}>
                    {entry.entity_name}
                  </p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    by {entry.performer_name} &middot; {fmtDate(entry.created_at)}
                  </p>
                  {entry.rejection_reason && (
                    <p className="text-xs mt-1" style={{ color: colors.muted }}>
                      Reason: {entry.rejection_reason}
                    </p>
                  )}
                  {entry.admin_notes && (
                    <p className="text-xs mt-0.5" style={{ color: colors.muted }}>
                      Notes: {entry.admin_notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Review Confirmation Modal */}
      <Modal
        visible={!!reviewAction && !!reviewItem}
        title={reviewAction === "approve" ? "Approve Permit" : "Reject Permit"}
        message={
          reviewAction === "approve"
            ? `Approve the business permit for "${reviewItem?.name}"?`
            : `Reject the business permit for "${reviewItem?.name}"? A reason is required.`
        }
        buttonText={reviewAction === "approve" ? "Approve" : "Reject"}
        danger={reviewAction === "reject"}
        showInput={reviewAction === "reject"}
        inputValue={rejectReason}
        onInputChange={setRejectReason}
        inputPlaceholder="Enter rejection reason (required)..."
        confirmDisabled={reviewAction === "reject" && !rejectReason.trim()}
        loading={reviewLoading}
        onConfirm={handleReview}
        onClose={() => { setReviewItem(null); setReviewAction(null); setRejectReason(""); setAdminNotes(""); }}
      />

      {/* Permit Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setPreviewUrl(null)}
          />
          <div
            className="relative w-full max-w-3xl max-h-[80vh] rounded-3xl p-6 shadow-2xl overflow-auto"
            style={{ backgroundColor: colors.card }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: colors.text }}>
                Business Permit Preview
              </h3>
              <button
                onClick={() => setPreviewUrl(null)}
                className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
              >
                <IoCloseCircle size={24} color={colors.textSecondary} />
              </button>
            </div>
            {previewUrl.endsWith(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[60vh] rounded-xl" title="Permit Preview" />
            ) : (
              <img src={previewUrl} alt="Business Permit" className="w-full rounded-xl object-contain max-h-[60vh]" />
            )}
            <div className="mt-4 flex justify-end">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm"
              >
                Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}

      <CustomAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onClose={() => setAlert((p) => ({ ...p, visible: false }))}
      />
    </div>
  );
}
