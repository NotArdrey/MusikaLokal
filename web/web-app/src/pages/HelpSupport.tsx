import { useState } from "react";
import {
    IoCallOutline,
    IoChevronBack,
    IoChevronDown,
    IoMailOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const faqs = [
  {
    q: "How do I book a studio?",
    a: "Browse studios on the Home page, select one, pick an available date and time, then confirm your booking. You will receive a notification once the studio owner accepts.",
  },
  {
    q: "How do I cancel a booking?",
    a: "Go to the Bookings page, find the booking you want to cancel, and tap the cancel button. Note that cancellation policies may apply and bookings are generally non-refundable.",
  },
  {
    q: "How do payments work?",
    a: "Payments are processed through PayMongo. When you book, the payment is held in escrow and released to the studio/musician after the booking is completed.",
  },
  {
    q: "What are the platform fees?",
    a: "MusikaLokal charges a small service fee on each transaction. The exact percentage is shown during checkout before you confirm payment.",
  },
  {
    q: "How do I post a gig?",
    a: "Go to Manage → My Gigs and tap the add button. Fill in the gig details including date, location, budget, and requirements.",
  },
  {
    q: "How do I withdraw earnings?",
    a: "Go to Settings → Wallet, add a payout method (Bank, GCash, Maya, or PayPal), then request a withdrawal. Processing may take 1-3 business days.",
  },
  {
    q: "How does verification work?",
    a: "Profile verification is handled through Didit KYC. Go to your Profile and tap the verification badge to start the process.",
  },
];

export default function HelpSupportPage() {
  const { colors, isDark } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="page-container">
      <div className="content-container max-w-2xl pt-6 pb-32">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-xl font-bold" style={{ color: colors.text }}>
            Help & Support
          </h1>
        </div>

        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="rounded-xl border overflow-hidden"
              style={{
                borderColor: isDark ? "#374151" : "#E5E7EB",
                backgroundColor: isDark ? "#1F2937" : "#fff",
              }}
            >
              <button
                className="flex w-full items-center justify-between p-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: colors.text }}
                >
                  {faq.q}
                </span>
                <IoChevronDown
                  size={18}
                  color={colors.textSecondary}
                  className={`flex-shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && (
                <div
                  className="border-t px-4 pb-4 pt-3"
                  style={{ borderColor: isDark ? "#374151" : "#E5E7EB" }}
                >
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: colors.textSecondary }}
                  >
                    {faq.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8">
          <h2
            className="mb-3 text-sm font-semibold"
            style={{ color: colors.text }}
          >
            Contact Us
          </h2>
          <div className="space-y-3">
            <a
              href="mailto:support@musikalokal.com"
              className="flex items-center gap-3 rounded-xl p-4 transition hover:opacity-80"
              style={{ backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }}
            >
              <IoMailOutline size={20} color={colors.primary} />
              <span className="text-sm" style={{ color: colors.text }}>
                support@musikalokal.com
              </span>
            </a>
            <a
              href="tel:+639123456789"
              className="flex items-center gap-3 rounded-xl p-4 transition hover:opacity-80"
              style={{ backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }}
            >
              <IoCallOutline size={20} color={colors.primary} />
              <span className="text-sm" style={{ color: colors.text }}>
                +63 912 345 6789
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
