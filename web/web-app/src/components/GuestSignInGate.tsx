import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function GuestSignInGate({
  children,
  message = "Sign in to access this feature",
}: {
  children?: React.ReactNode;
  message?: string;
}) {
  const { isGuest, setGuestMode } = useAuth();
  const { colors } = useTheme();
  const navigate = useNavigate();

  if (!isGuest) return <>{children}</>;

  const handleSignIn = () => {
    setGuestMode(false);
    navigate("/", { replace: true });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.primaryLight }}
      >
        <svg
          className="h-10 w-10"
          fill="none"
          stroke={colors.primary}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <p className="mb-6 text-base" style={{ color: colors.textSecondary }}>
        {message}
      </p>
      <button className="btn-primary text-base" onClick={handleSignIn}>
        Sign In
      </button>
    </div>
  );
}
