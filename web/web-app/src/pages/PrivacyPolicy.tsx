import { IoChevronBack } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const sections = [
  {
    title: "1. Information We Collect",
    body: "We collect personal information you provide during registration (name, email, phone number), profile details (bio, location, musical roles, genres), and transactional data (wallet balances, booking history, payment records).",
  },
  {
    title: "2. How We Use Your Information",
    body: "Your data is used to: provide and improve our services, process bookings and payments, send notifications, personalize recommendations, verify identities, and comply with legal obligations.",
  },
  {
    title: "3. Data Sharing",
    body: "We share data with: payment processors (PayMongo) for transactions, identity verification services (Didit) for KYC, and other users as necessary to facilitate bookings (e.g., sharing musician contact info with studio owners for confirmed bookings).",
  },
  {
    title: "4. Data Storage & Security",
    body: "Your data is stored securely on Supabase cloud infrastructure. We implement industry-standard security measures including encryption in transit and at rest, row-level security policies, and regular security audits.",
  },
  {
    title: "5. Location Data",
    body: "We collect location data that you provide when setting up your profile or listing. This data is used to show nearby studios, musicians, and gigs. You can update your location at any time.",
  },
  {
    title: "6. Data Retention",
    body: "We retain your personal data for as long as your account is active. Upon account deletion, we remove personal data within 30 days, except where retention is required by law.",
  },
  {
    title: "7. Your Rights",
    body: "You have the right to: access your personal data, correct inaccurate data, request data deletion, export your data, and withdraw consent for data processing. Contact us to exercise these rights.",
  },
  {
    title: "8. Cookies & Analytics",
    body: "We use essential cookies for authentication and session management. We may use analytics tools to understand usage patterns and improve the platform.",
  },
  {
    title: "9. Changes to This Policy",
    body: "We may update this privacy policy periodically. We will notify you of significant changes via email or in-app notifications.",
  },
];

export default function PrivacyPolicyPage() {
  const { colors } = useTheme();
  const navigate = useNavigate();

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
            Privacy Policy
          </h1>
        </div>
        <div className="space-y-6">
          {sections.map((s, i) => (
            <div key={i}>
              <h2
                className="mb-2 text-sm font-bold"
                style={{ color: colors.text }}
              >
                {s.title}
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: colors.textSecondary }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
