import { useEffect, useState } from "react";
import {
    IoArrowDown,
    IoArrowUp,
    IoCardOutline,
    IoChevronBack,
    IoWalletOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function WalletPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("");
  const [payoutMethods, setPayoutMethods] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!user) return;
    fetchWalletData();
  }, [user]);

  const fetchWalletData = async () => {
    setLoading(true);
    try {
      const [walletRes, methodsRes, withdrawalsRes] = await Promise.all([
        supabase
          .from("wallets")
          .select("balance")
          .eq("user_id", user!.id)
          .single(),
        supabase
          .from("payout_methods")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("withdrawal_requests")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (walletRes.data) setBalance(walletRes.data.balance ?? 0);
      if (methodsRes.data) setPayoutMethods(methodsRes.data);
      if (withdrawalsRes.data) setWithdrawals(withdrawalsRes.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      setAlert({
        visible: true,
        type: "error",
        title: "Invalid Amount",
        message: "Enter a valid amount.",
      });
      return;
    }
    if (amount > balance) {
      setAlert({
        visible: true,
        type: "error",
        title: "Insufficient Balance",
        message: "Amount exceeds your balance.",
      });
      return;
    }
    if (!payoutMethod) {
      setAlert({
        visible: true,
        type: "error",
        title: "No Payout Method",
        message: "Select a payout method first.",
      });
      return;
    }
    setProcessing(true);
    try {
      const { error } = await supabase.from("withdrawal_requests").insert({
        user_id: user!.id,
        amount,
        payout_method_id: payoutMethod,
        status: "pending",
      });
      if (error) throw error;
      setAlert({
        visible: true,
        type: "success",
        title: "Withdrawal Requested",
        message: `₱${amount.toFixed(2)} withdrawal is being processed.`,
      });
      setWithdrawAmount("");
      setShowWithdraw(false);
      fetchWalletData();
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to submit withdrawal.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const cardBg = isDark
    ? "bg-gray-800 border-gray-700"
    : "bg-white border-gray-200";

  return (
    <div className="page-container">
      <div className="content-container max-w-2xl pt-6 pb-32">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: colors.text }}>
            Wallet
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="spinner" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Balance Card */}
            <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
              <div className="flex items-center gap-2 text-sm opacity-80">
                <IoWalletOutline size={18} />
                Available Balance
              </div>
              <div className="mt-2 text-3xl font-bold">
                ₱{balance.toFixed(2)}
              </div>
              <button
                className="mt-4 rounded-xl bg-white/20 px-5 py-2 text-sm font-medium hover:bg-white/30 transition"
                onClick={() => setShowWithdraw(!showWithdraw)}
              >
                Withdraw
              </button>
            </div>

            {/* Withdraw Form */}
            {showWithdraw && (
              <div className={`card space-y-4 ${cardBg}`}>
                <h3 className="font-semibold" style={{ color: colors.text }}>
                  Withdraw Funds
                </h3>
                <input
                  type="number"
                  className="input-field"
                  placeholder="Amount (₱)"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                />
                <select
                  className="input-field"
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value)}
                >
                  <option value="">Select payout method</option>
                  {payoutMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.type} — {m.account_name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary w-full"
                  onClick={handleWithdraw}
                  disabled={processing}
                >
                  {processing ? (
                    <span className="spinner" />
                  ) : (
                    "Submit Withdrawal"
                  )}
                </button>
              </div>
            )}

            {/* Payout Methods */}
            <div className={`card ${cardBg}`}>
              <h3 className="mb-3 font-semibold" style={{ color: colors.text }}>
                Payout Methods
              </h3>
              {payoutMethods.length === 0 ? (
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  No payout methods added yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {payoutMethods.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-xl p-3"
                      style={{
                        backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      }}
                    >
                      <IoCardOutline size={20} color={colors.primary} />
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: colors.text }}
                        >
                          {m.type}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: colors.textSecondary }}
                        >
                          {m.account_name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Withdrawals */}
            <div className={`card ${cardBg}`}>
              <h3 className="mb-3 font-semibold" style={{ color: colors.text }}>
                Recent Withdrawals
              </h3>
              {withdrawals.length === 0 ? (
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  No withdrawals yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {withdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded-xl p-3"
                      style={{
                        backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        {w.status === "completed" ? (
                          <IoArrowUp size={18} className="text-green-500" />
                        ) : (
                          <IoArrowDown size={18} className="text-yellow-500" />
                        )}
                        <div>
                          <div
                            className="text-sm font-medium"
                            style={{ color: colors.text }}
                          >
                            ₱{w.amount?.toFixed(2)}
                          </div>
                          <div
                            className="text-xs"
                            style={{ color: colors.textSecondary }}
                          >
                            {new Date(w.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          w.status === "completed"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : w.status === "pending"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
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
