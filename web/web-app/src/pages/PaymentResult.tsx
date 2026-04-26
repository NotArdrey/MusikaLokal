import { IoCheckmarkCircle, IoCloseCircle } from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

export default function PaymentResultPage() {
  const { colors } = useTheme();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get("status") || "failed";
  const bookingId = params.get("booking_id");
  const isSuccess = status === "success";

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: colors.background }}
    >
      <div className="text-center">
        {isSuccess ? (
          <IoCheckmarkCircle size={72} className="mx-auto text-green-500" />
        ) : (
          <IoCloseCircle size={72} className="mx-auto text-red-500" />
        )}
        <h1 className="mt-4 text-2xl font-bold" style={{ color: colors.text }}>
          {isSuccess ? "Payment Successful!" : "Payment Failed"}
        </h1>
        <p className="mt-2 text-sm" style={{ color: colors.textSecondary }}>
          {isSuccess
            ? bookingId
              ? "Your booking has been confirmed."
              : "Your payment was processed successfully."
            : "Something went wrong with your payment. Please try again."}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button className="btn-primary" onClick={() => navigate("/home")}>
            Go Home
          </button>
          {bookingId && (
            <button
              className="btn-secondary"
              onClick={() => navigate("/bookings")}
            >
              View Bookings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
