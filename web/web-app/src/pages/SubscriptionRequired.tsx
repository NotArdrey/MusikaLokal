import { useEffect, useState } from "react";
import { IoCheckmarkCircle, IoRocketOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  features: string[];
}

export default function SubscriptionRequiredPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("price");
      if (data) setPlans(data as Plan[]);
      setLoading(false);
    })();
  }, []);

  const handleSubscribe = async () => {
    if (!selected || !user) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: {
            plan_id: selected,
            success_url: `${window.location.origin}/payment-result?status=success&plan_id=${selected}`,
            cancel_url: `${window.location.origin}/payment-result?status=failed`,
          },
        },
      );
      if (error) throw error;
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch {
      // handle error
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="page-container">
      <div className="content-container max-w-2xl pt-10 pb-32">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
            <IoRocketOutline size={32} className="text-indigo-500" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
            Subscription Required
          </h1>
          <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
            A subscription is needed to manage studios, post gigs, and access
            premium features.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="spinner" />
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className={`w-full rounded-2xl border-2 p-5 text-left transition ${
                  selected === plan.id
                    ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800"
                    : isDark
                      ? "border-gray-700 hover:border-gray-600"
                      : "border-gray-200 hover:border-gray-300"
                }`}
                style={{ backgroundColor: isDark ? "#1F2937" : "#fff" }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold" style={{ color: colors.text }}>
                    {plan.name}
                  </h3>
                  <span className="text-lg font-bold text-indigo-500">
                    ₱{plan.price}
                  </span>
                </div>
                <p
                  className="mt-1 text-xs"
                  style={{ color: colors.textSecondary }}
                >
                  {plan.duration_days} days
                </p>
                {plan.features && (
                  <ul className="mt-3 space-y-1">
                    {plan.features.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        <IoCheckmarkCircle
                          size={14}
                          className="text-green-500 flex-shrink-0"
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button className="btn-secondary flex-1" onClick={() => navigate(-1)}>
            Back
          </button>
          <button
            className="btn-primary flex-1"
            onClick={handleSubscribe}
            disabled={!selected || processing}
          >
            {processing ? <span className="spinner" /> : "Subscribe Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
