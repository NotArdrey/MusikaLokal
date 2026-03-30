import { IoChevronBack } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: "By accessing and using MusikaLokal, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the platform.",
  },
  {
    title: "2. User Accounts",
    body: "Users must register with a valid email and provide accurate information. You are responsible for maintaining the security of your account and password. MusikaLokal reserves the right to terminate accounts that violate these terms.",
  },
  {
    title: "3. Bookings & Payments",
    body: "All bookings are subject to availability and confirmation by the service provider. Payments are processed via PayMongo and held in escrow until the service is completed. A service fee is charged on each transaction.",
  },
  {
    title: "4. Cancellation Policy",
    body: "Bookings are generally non-refundable once confirmed. Studio owners and gig organizers may set their own cancellation windows. MusikaLokal is not responsible for disputes between users and service providers.",
  },
  {
    title: "5. Subscriptions",
    body: "Studio owners and venue managers require an active subscription to list their services. Subscription fees are billed according to the selected plan. Subscriptions auto-renew unless cancelled before the renewal date.",
  },
  {
    title: "6. Prohibited Conduct",
    body: "Users must not: post misleading information, harass other users, exploit system vulnerabilities, create multiple accounts for abuse, or use the platform for illegal activities.",
  },
  {
    title: "7. Intellectual Property",
    body: "All content uploaded by users remains their property. By posting content, users grant MusikaLokal a non-exclusive license to display and distribute the content on the platform.",
  },
  {
    title: "8. Limitation of Liability",
    body: 'MusikaLokal is provided "as is" without warranties. We are not liable for indirect, incidental, or consequential damages arising from your use of the platform.',
  },
  {
    title: "9. Changes to Terms",
    body: "We reserve the right to modify these terms at any time. Continued use of the platform after changes constitutes acceptance of the updated terms.",
  },
];

export default function TermsAndConditionsPage() {
  const { colors, isDark } = useTheme();
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
            Terms & Conditions
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
