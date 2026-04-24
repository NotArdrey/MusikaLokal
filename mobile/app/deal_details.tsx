import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal as RNModal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Modal from "../src/components/modal";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { formatFriendlyDateTime } from "../src/utils/friendlyDateTime";

const { width } = Dimensions.get("window");
const scale = (size: number) => (width / 375) * size;
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

export default function DealDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ deal_id: string; deal_type: string }>();
  const { deal_id, deal_type } = params;

  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [dealTypeLabel, setDealTypeLabel] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Counter offer state
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterVenuePct, setCounterVenuePct] = useState("");
  const [counterProductionPct, setCounterProductionPct] = useState("");
  const [counterFixedFee, setCounterFixedFee] = useState("");
  const [counterDeposit, setCounterDeposit] = useState("");
  const [counterNotes, setCounterNotes] = useState("");

  // Settlement state
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementRevenue, setSettlementRevenue] = useState("");

  // Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
  }>({ type: "info", title: "", message: "" });

  // Confirm modal
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string>("");

  const showAlert = (type: AlertType, title: string, message: string) => {
    setAlertConfig({ type, title, message });
    setAlertVisible(true);
  };

  const fetchDeal = useCallback(async () => {
    if (!deal_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "get_deal_details",
          deal_id,
          deal_type: deal_type || "venue_partnership",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDeal(data?.deal);
      setDealTypeLabel(data?.deal_type === "recording" ? "Recording Deal" : "Venue Partnership");
    } catch (err: any) {
      showAlert("error", "Error", err?.message || "Failed to load deal");
    } finally {
      setLoading(false);
    }
  }, [deal_id, deal_type]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  const handleAccept = async () => {
    setActionLoading(true);
    try {
      if (deal_type === "recording") {
        const { data, error } = await supabase.functions.invoke("manage-deals", {
          body: { action: "accept_recording_deal", deal_id },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        // Get latest term version
        const latestTermId =
          deal?.deal_term_versions?.sort(
            (a: any, b: any) => b.version_number - a.version_number,
          )?.[0]?.id;
        if (!latestTermId) throw new Error("No term version to accept");

        const { data, error } = await supabase.functions.invoke("manage-deals", {
          body: {
            action: "accept_venue_partnership_deal",
            deal_id,
            term_version_id: latestTermId,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }
      showAlert("success", "Success", "Deal accepted!");
      fetchDeal();
    } catch (err: any) {
      showAlert("error", "Error", err?.message || "Failed to accept deal");
    } finally {
      setActionLoading(false);
      setConfirmVisible(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: { action: "reject_venue_partnership_deal", deal_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showAlert("success", "Rejected", "Deal has been rejected.");
      fetchDeal();
    } catch (err: any) {
      showAlert("error", "Error", err?.message || "Failed to reject deal");
    } finally {
      setActionLoading(false);
      setConfirmVisible(false);
    }
  };

  const handleCounter = async () => {
    if (!counterVenuePct || !counterProductionPct) {
      showAlert("error", "Error", "Revenue split percentages are required");
      return;
    }
    if (Number(counterVenuePct) + Number(counterProductionPct) !== 100) {
      showAlert("error", "Error", "Revenue split must total 100%");
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "counter_venue_partnership_deal",
          deal_id,
          revenue_split_venue_pct: Number(counterVenuePct),
          revenue_split_production_pct: Number(counterProductionPct),
          fixed_fee: Number(counterFixedFee || 0),
          deposit_amount: Number(counterDeposit || 0),
          notes: counterNotes,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showAlert("success", "Sent", "Counteroffer submitted!");
      setShowCounterModal(false);
      fetchDeal();
    } catch (err: any) {
      showAlert("error", "Error", err?.message || "Failed to submit counteroffer");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async () => {
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: { action: "raise_deal_dispute", deal_id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showAlert("warning", "Dispute Raised", "A dispute has been raised for this deal.");
      fetchDeal();
    } catch (err: any) {
      showAlert("error", "Error", err?.message || "Failed to raise dispute");
    } finally {
      setActionLoading(false);
      setConfirmVisible(false);
    }
  };

  const handleSettle = async () => {
    if (!settlementRevenue || isNaN(Number(settlementRevenue)) || Number(settlementRevenue) <= 0) {
      showAlert("error", "Error", "Please enter a valid gross revenue amount");
      return;
    }
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "mark_settlement_paid",
          deal_id,
          gross_revenue: Number(settlementRevenue),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showAlert("success", "Settled", "Settlement has been recorded.");
      setShowSettlementModal(false);
      setSettlementRevenue("");
      fetchDeal();
    } catch (err: any) {
      showAlert("error", "Error", err?.message || "Failed to settle deal");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMessageParty = () => {
    // Determine the other party to message
    const otherPartyId = deal?.venue_owner?.id !== userId
      ? deal?.venue_owner?.id
      : deal?.counterparty?.id || deal?.production_teams?.owner_id;
    const otherPartyName = deal?.venue_owner?.id !== userId
      ? deal?.venue_owner?.full_name
      : deal?.counterparty?.full_name || deal?.production_teams?.name;

    if (!otherPartyId) {
      showAlert("warning", "Error", "Could not determine the other party");
      return;
    }
    router.push({
      pathname: "/chat",
      params: {
        recipientId: otherPartyId,
        recipientName: otherPartyName || "Deal Counterparty",
        dealId: deal_id,
      },
    });
  };

  const statusColors: Record<string, string> = {
    proposed: "#F59E0B",
    countered: "#3B82F6",
    accepted: "#10B981",
    rejected: "#EF4444",
    cancelled: "#6B7280",
    settled: "#8B5CF6",
    disputed: "#EF4444",
    expired: "#6B7280",
    completed: "#10B981",
  };

  const renderTermVersion = (term: any, isLatest: boolean) => (
    <View
      key={term.id}
      style={[
        styles.termCard,
        {
          backgroundColor: isLatest ? colors.primary + "10" : colors.card,
          borderColor: isLatest ? colors.primary : colors.border,
        },
      ]}
    >
      {isLatest && (
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: moderateScale(6) }}>
          <Ionicons name="checkmark-circle" size={moderateScale(14)} color={colors.primary} />
          <Text style={{ fontSize: moderateScale(12), fontWeight: "600", color: colors.primary, marginLeft: 4 }}>
            Latest Terms
          </Text>
        </View>
      )}
      <Text style={[styles.termLabel, { color: colors.textSecondary }]}>
        Version {term.version_number}
      </Text>
      <View style={styles.termRow}>
        <Text style={[styles.termKey, { color: colors.textSecondary }]}>Venue Split</Text>
        <Text style={[styles.termValue, { color: colors.text }]}>{term.revenue_split_venue_pct}%</Text>
      </View>
      <View style={styles.termRow}>
        <Text style={[styles.termKey, { color: colors.textSecondary }]}>Production Split</Text>
        <Text style={[styles.termValue, { color: colors.text }]}>{term.revenue_split_production_pct}%</Text>
      </View>
      {term.fixed_fee > 0 && (
        <View style={styles.termRow}>
          <Text style={[styles.termKey, { color: colors.textSecondary }]}>Fixed Fee</Text>
          <Text style={[styles.termValue, { color: colors.text }]}>₱{term.fixed_fee?.toLocaleString()}</Text>
        </View>
      )}
      {term.deposit_amount > 0 && (
        <View style={styles.termRow}>
          <Text style={[styles.termKey, { color: colors.textSecondary }]}>Deposit</Text>
          <Text style={[styles.termValue, { color: colors.text }]}>₱{term.deposit_amount?.toLocaleString()}</Text>
        </View>
      )}
      {term.event_date && (
        <View style={styles.termRow}>
          <Text style={[styles.termKey, { color: colors.textSecondary }]}>Event Date</Text>
          <Text style={[styles.termValue, { color: colors.text }]}>
            {new Date(term.event_date).toLocaleDateString()}
          </Text>
        </View>
      )}
      <Text style={{ fontSize: moderateScale(11), color: colors.textSecondary, marginTop: moderateScale(4) }}>
        {formatFriendlyDateTime(term.created_at)}
      </Text>
    </View>
  );

  const renderNegotiationEvent = (event: any) => {
    const eventIcons: Record<string, string> = {
      proposal: "document-text-outline",
      counteroffer: "swap-horizontal-outline",
      acceptance: "checkmark-circle-outline",
      rejection: "close-circle-outline",
      cancellation: "ban-outline",
      settlement_update: "cash-outline",
      dispute_raised: "warning-outline",
      dispute_resolved: "shield-checkmark-outline",
    };

    return (
      <View key={event.id} style={[styles.eventRow, { borderColor: colors.border }]}>
        <Ionicons
          name={(eventIcons[event.event_type] || "ellipse-outline") as any}
          size={moderateScale(18)}
          color={colors.primary}
        />
        <View style={{ flex: 1, marginLeft: scale(10) }}>
          <Text style={{ fontSize: moderateScale(13), fontWeight: "600", color: colors.text, textTransform: "capitalize" }}>
            {event.event_type?.replace(/_/g, " ")}
          </Text>
          {event.notes && (
            <Text style={{ fontSize: moderateScale(12), color: colors.textSecondary, marginTop: 2 }}>
              {event.notes}
            </Text>
          )}
          <Text style={{ fontSize: moderateScale(11), color: colors.textSecondary, marginTop: 2 }}>
            {formatFriendlyDateTime(event.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  const canAcceptOrReject =
    deal &&
    ["proposed", "countered"].includes(deal.status) &&
    deal_type !== "recording" &&
    deal?.deal_term_versions?.sort((a: any, b: any) => b.version_number - a.version_number)?.[0]
      ?.proposed_by_user_id !== userId;

  const canAcceptRecording =
    deal && deal.status === "proposed" && deal_type === "recording" && deal.proposed_by_user_id !== userId;

  const canCounter =
    deal &&
    ["proposed", "countered"].includes(deal.status) &&
    deal_type !== "recording";

  const canDispute =
    deal && ["accepted", "settled"].includes(deal.status) && deal_type !== "recording";

  const canSettle =
    deal && deal.status === "accepted" && deal_type !== "recording";

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Deal Details" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Navbar />
      </View>
    );
  }

  if (!deal) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Deal Details" />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary }}>Deal not found</Text>
        </View>
        <Navbar />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Deal Details" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Deal Header */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.dealTitle, { color: colors.text }]}>{deal.title}</Text>
            <View
              style={{
                backgroundColor: (statusColors[deal.status] || colors.textSecondary) + "20",
                paddingHorizontal: scale(12),
                paddingVertical: scale(4),
                borderRadius: moderateScale(12),
              }}
            >
              <Text
                style={{
                  fontSize: moderateScale(13),
                  fontWeight: "600",
                  color: statusColors[deal.status] || colors.textSecondary,
                  textTransform: "capitalize",
                }}
              >
                {deal.status}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary, marginTop: moderateScale(4) }}>
            {dealTypeLabel}
          </Text>

          {/* Parties */}
          {deal.venue_owner && (
            <View style={[styles.partyRow, { borderColor: colors.border }]}>
              <Ionicons name="business-outline" size={moderateScale(16)} color={colors.primary} />
              <Text style={{ fontSize: moderateScale(13), color: colors.text, marginLeft: scale(8) }}>
                Venue: {deal.venue_owner.full_name}
              </Text>
            </View>
          )}
          {deal.production_teams?.name && (
            <View style={[styles.partyRow, { borderColor: colors.border }]}>
              <Ionicons name="people-outline" size={moderateScale(16)} color={colors.primary} />
              <Text style={{ fontSize: moderateScale(13), color: colors.text, marginLeft: scale(8) }}>
                Team: {deal.production_teams.name}
              </Text>
            </View>
          )}
          {deal.counterparty && (
            <View style={[styles.partyRow, { borderColor: colors.border }]}>
              <Ionicons name="person-outline" size={moderateScale(16)} color={colors.primary} />
              <Text style={{ fontSize: moderateScale(13), color: colors.text, marginLeft: scale(8) }}>
                Counterparty: {deal.counterparty.full_name}
              </Text>
            </View>
          )}
          {deal.studios?.name && (
            <View style={[styles.partyRow, { borderColor: colors.border }]}>
              <Ionicons name="musical-notes-outline" size={moderateScale(16)} color={colors.primary} />
              <Text style={{ fontSize: moderateScale(13), color: colors.text, marginLeft: scale(8) }}>
                Studio: {deal.studios.name}
              </Text>
            </View>
          )}
        </View>

        {/* Term Versions (venue partnership only) */}
        {deal.deal_term_versions && deal.deal_term_versions.length > 0 && (
          <View style={{ marginTop: moderateScale(16) }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Terms</Text>
            {deal.deal_term_versions
              .sort((a: any, b: any) => b.version_number - a.version_number)
              .map((term: any, idx: number) => renderTermVersion(term, idx === 0))}
          </View>
        )}

        {/* Recording Packages */}
        {deal.recording_deal_packages && deal.recording_deal_packages.length > 0 && (
          <View style={{ marginTop: moderateScale(16) }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Packages</Text>
            {deal.recording_deal_packages.map((pkg: any) => (
              <View
                key={pkg.id}
                style={[styles.termCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={{ fontSize: moderateScale(14), fontWeight: "600", color: colors.text }}>
                  {pkg.name}
                </Text>
                <View style={styles.termRow}>
                  <Text style={[styles.termKey, { color: colors.textSecondary }]}>Hours</Text>
                  <Text style={[styles.termValue, { color: colors.text }]}>{pkg.hours_included}h</Text>
                </View>
                {pkg.songs_included && (
                  <View style={styles.termRow}>
                    <Text style={[styles.termKey, { color: colors.textSecondary }]}>Songs</Text>
                    <Text style={[styles.termValue, { color: colors.text }]}>{pkg.songs_included}</Text>
                  </View>
                )}
                <View style={styles.termRow}>
                  <Text style={[styles.termKey, { color: colors.textSecondary }]}>Price</Text>
                  <Text style={[styles.termValue, { color: colors.text }]}>₱{pkg.price?.toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Negotiation Timeline (venue partnership only) */}
        {deal.deal_negotiation_events && deal.deal_negotiation_events.length > 0 && (
          <View style={{ marginTop: moderateScale(16) }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Timeline</Text>
            {deal.deal_negotiation_events
              .sort(
                (a: any, b: any) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              )
              .map((event: any) => renderNegotiationEvent(event))}
          </View>
        )}

        {/* Action Buttons */}
        <View style={{ marginTop: moderateScale(24), gap: moderateScale(12), paddingBottom: moderateScale(100) }}>
          {(canAcceptOrReject || canAcceptRecording) && (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: "#10B981" }]}
              onPress={() => {
                setConfirmAction("accept");
                setConfirmVisible(true);
              }}
              disabled={actionLoading}
            >
              <Ionicons name="checkmark-circle-outline" size={moderateScale(18)} color="#FFF" />
              <Text style={styles.actionBtnText}>Accept Deal</Text>
            </TouchableOpacity>
          )}

          {canCounter && (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: "#3B82F6" }]}
              onPress={() => {
                // Pre-fill with latest terms
                const latest = deal?.deal_term_versions?.sort(
                  (a: any, b: any) => b.version_number - a.version_number,
                )?.[0];
                if (latest) {
                  setCounterVenuePct(String(latest.revenue_split_venue_pct));
                  setCounterProductionPct(String(latest.revenue_split_production_pct));
                  setCounterFixedFee(String(latest.fixed_fee || 0));
                  setCounterDeposit(String(latest.deposit_amount || 0));
                }
                setShowCounterModal(true);
              }}
              disabled={actionLoading}
            >
              <Ionicons name="swap-horizontal-outline" size={moderateScale(18)} color="#FFF" />
              <Text style={styles.actionBtnText}>Counter Offer</Text>
            </TouchableOpacity>
          )}

          {canAcceptOrReject && (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: "#EF4444" }]}
              onPress={() => {
                setConfirmAction("reject");
                setConfirmVisible(true);
              }}
              disabled={actionLoading}
            >
              <Ionicons name="close-circle-outline" size={moderateScale(18)} color="#FFF" />
              <Text style={styles.actionBtnText}>Reject Deal</Text>
            </TouchableOpacity>
          )}

          {canDispute && (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: "#F59E0B" }]}
              onPress={() => {
                setConfirmAction("dispute");
                setConfirmVisible(true);
              }}
              disabled={actionLoading}
            >
              <Ionicons name="warning-outline" size={moderateScale(18)} color="#FFF" />
              <Text style={styles.actionBtnText}>Raise Dispute</Text>
            </TouchableOpacity>
          )}

          {canSettle && (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: "#8B5CF6" }]}
              onPress={() => setShowSettlementModal(true)}
              disabled={actionLoading}
            >
              <Ionicons name="cash-outline" size={moderateScale(18)} color="#FFF" />
              <Text style={styles.actionBtnText}>Mark Settlement</Text>
            </TouchableOpacity>
          )}

          {/* Message counterparty */}
          {deal && (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleMessageParty}
            >
              <Ionicons name="chatbubble-outline" size={moderateScale(18)} color="#FFF" />
              <Text style={styles.actionBtnText}>Message</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Confirm Modal */}
      <Modal
        visible={confirmVisible}
        title={
          confirmAction === "accept"
            ? "Accept Deal?"
            : confirmAction === "reject"
              ? "Reject Deal?"
              : "Raise Dispute?"
        }
        message={
          confirmAction === "accept"
            ? "Are you sure you want to accept the current terms?"
            : confirmAction === "reject"
              ? "This action cannot be undone."
              : "This will flag the deal for administrative review."
        }
        buttonText="Confirm"
        onConfirm={() => {
          if (confirmAction === "accept") handleAccept();
          else if (confirmAction === "reject") handleReject();
          else if (confirmAction === "dispute") handleDispute();
        }}
        onClose={() => setConfirmVisible(false)}
      />

      {/* Counter Offer Modal */}
      <RNModal
        visible={showCounterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCounterModal(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: scale(20), width: "88%", maxWidth: 420 }}>
            <Text style={{ fontSize: moderateScale(16), fontFamily: "Poppins_600SemiBold", color: colors.text, marginBottom: moderateScale(12) }}>
              Submit Counteroffer
            </Text>
            <View style={{ gap: moderateScale(10) }}>
              <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary }}>
                Venue Split %
              </Text>
              <TextInput
                value={counterVenuePct}
                onChangeText={(v) => {
                  setCounterVenuePct(v);
                  const num = Number(v);
                  if (!isNaN(num)) setCounterProductionPct(String(100 - num));
                }}
                keyboardType="numeric"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 60"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary }}>
                Production Split %
              </Text>
              <TextInput
                value={counterProductionPct}
                onChangeText={(v) => {
                  setCounterProductionPct(v);
                  const num = Number(v);
                  if (!isNaN(num)) setCounterVenuePct(String(100 - num));
                }}
                keyboardType="numeric"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 40"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary }}>
                Fixed Fee (₱)
              </Text>
              <TextInput
                value={counterFixedFee}
                onChangeText={setCounterFixedFee}
                keyboardType="numeric"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary }}>
                Deposit Amount (₱)
              </Text>
              <TextInput
                value={counterDeposit}
                onChangeText={setCounterDeposit}
                keyboardType="numeric"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary }}>
                Notes
              </Text>
              <TextInput
                value={counterNotes}
                onChangeText={setCounterNotes}
                multiline
                style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: moderateScale(60) }]}
                placeholder="Optional notes..."
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: scale(10), marginTop: moderateScale(16) }}>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowCounterModal(false)} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.inputBackground }}>
                <Text style={{ color: colors.text, fontFamily: "Poppins_500Medium" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={1} onPress={handleCounter} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.primary }}>
                <Text style={{ color: "#fff", fontFamily: "Poppins_500Medium" }}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      {/* Settlement Modal */}
      <RNModal
        visible={showSettlementModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettlementModal(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: scale(20), width: "88%", maxWidth: 420 }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: "700", color: colors.text, marginBottom: moderateScale(12) }}>
              Record Settlement
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary, marginBottom: moderateScale(12) }}>
              Enter the gross revenue amount to calculate the settlement split.
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: colors.textSecondary }}>
              Gross Revenue (₱)
            </Text>
            <TextInput
              value={settlementRevenue}
              onChangeText={setSettlementRevenue}
              keyboardType="numeric"
              style={[styles.input, { color: colors.text, borderColor: colors.border, marginTop: moderateScale(6) }]}
              placeholder="e.g. 50000"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: scale(10), marginTop: moderateScale(16) }}>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowSettlementModal(false)} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: colors.inputBackground }}>
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={1} onPress={handleSettle} disabled={actionLoading} style={{ paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8, backgroundColor: "#8B5CF6", opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "600" }}>Settle</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
      />

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: scale(16) },
  section: {
    padding: scale(16),
    borderRadius: scale(12),
    borderWidth: 1,
  },
  dealTitle: {
    fontSize: moderateScale(18),
    fontWeight: "700",
    flex: 1,
    marginRight: scale(8),
  },
  sectionTitle: {
    fontSize: moderateScale(16),
    fontWeight: "700",
    marginBottom: moderateScale(10),
  },
  partyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: moderateScale(8),
    paddingTop: moderateScale(8),
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  termCard: {
    padding: scale(12),
    borderRadius: scale(10),
    borderWidth: 1,
    marginBottom: moderateScale(10),
  },
  termLabel: {
    fontSize: moderateScale(12),
    fontWeight: "600",
    marginBottom: moderateScale(6),
  },
  termRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: moderateScale(3),
  },
  termKey: { fontSize: moderateScale(13) },
  termValue: { fontSize: moderateScale(13), fontWeight: "600" },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: moderateScale(10),
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: moderateScale(14),
    borderRadius: scale(10),
    gap: scale(8),
  },
  actionBtnText: {
    color: "#FFF",
    fontSize: moderateScale(15),
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: scale(8),
    paddingHorizontal: scale(12),
    paddingVertical: scale(10),
    fontSize: moderateScale(14),
    textAlignVertical: "center",
  },
});
