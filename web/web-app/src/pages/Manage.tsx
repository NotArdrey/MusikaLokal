import {
    IoBusinessOutline,
    IoChevronForward,
    IoHomeOutline,
    IoMusicalNotesOutline,
    IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import GuestSignInGate from "../components/GuestSignInGate";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function ManagePage() {
  const { colors, isDark } = useTheme();
  const { session, isGuest, userRole, isAdmin } = useAuth();
  const navigate = useNavigate();

  if (isGuest) {
    return (
      <div className="page-container">
        <Header title="Manage" />
        <GuestSignInGate message="Sign in to manage your listings" />
      </div>
    );
  }

  const sections = [
    {
      title: "Admin",
      condition: isAdmin,
      items: [
        {
          label: "Admin Dashboard",
          desc: "Manage permits, users, reports, and audit logs",
          Icon: IoShieldCheckmarkOutline,
          route: "/admin",
        },
      ],
    },
    {
      title: "For Musicians",
      condition:
        !userRole ||
        userRole === "musician" ||
        userRole === "manager" ||
        userRole === "musician-member",
      items: [
        {
          label: "My Groups",
          desc: "Create and manage your music groups",
          Icon: IoMusicalNotesOutline,
          route: "/my-group",
        },
      ],
    },
    {
      title: "For Studio Owners",
      condition: userRole === "studio-owner",
      items: [
        {
          label: "My Studios",
          desc: "Manage your recording studios",
          Icon: IoBusinessOutline,
          route: "/my-studio",
        },
      ],
    },
    {
      title: "For Venue Owners",
      condition: userRole === "venue-owner",
      items: [
        {
          label: "My Venues & Gigs",
          desc: "Manage venue listings and gigs",
          Icon: IoHomeOutline,
          route: "/my-venue",
        },
      ],
    },
  ];

  return (
    <div className="page-container">
      <Header title="Manage" />

      <div className="content-container pb-32">
        <div className="mx-auto max-w-3xl space-y-8">
          {sections
            .filter((s) => s.condition)
            .map((section) => (
              <div key={section.title}>
                <p
                  className="mb-3 pl-1 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: colors.textSecondary }}
                >
                  {section.title}
                </p>
                <div className="space-y-3">
                  {section.items.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => navigate(item.route)}
                      className="card flex w-full items-center gap-5 text-left transition-all hover:shadow-md"
                    >
                      <div
                        className="flex h-14 w-14 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: isDark
                            ? colors.primaryLight
                            : "#EEF2FF",
                        }}
                      >
                        <item.Icon size={24} color={colors.primary} />
                      </div>
                      <div className="flex-1">
                        <p
                          className="text-base font-semibold"
                          style={{ color: colors.text }}
                        >
                          {item.label}
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: colors.textSecondary }}
                        >
                          {item.desc}
                        </p>
                      </div>
                      <IoChevronForward
                        size={20}
                        color={colors.textSecondary}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
