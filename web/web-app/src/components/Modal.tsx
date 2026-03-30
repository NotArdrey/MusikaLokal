import { useEffect } from "react";
import { useTheme } from "../context/ThemeContext";

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title?: string;
  message?: string;
  buttonText?: string;
  showInput?: boolean;
  danger?: boolean;
  onInputChange?: (text: string) => void;
  inputValue?: string;
  inputPlaceholder?: string;
  inputMultiline?: boolean;
  confirmDisabled?: boolean;
  loading?: boolean;
  loadingMessage?: string;
}

export default function Modal({
  visible,
  onClose,
  onConfirm,
  title,
  message = "",
  buttonText = "Close",
  showInput = false,
  danger = false,
  onInputChange,
  inputValue,
  inputPlaceholder = "Enter reason...",
  inputMultiline = true,
  confirmDisabled = false,
  loading = false,
  loadingMessage = "Please wait...",
}: ModalProps) {
  const { colors, isDark } = useTheme();

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-md rounded-3xl p-6 shadow-2xl animate-scale-in"
        style={{ backgroundColor: colors.card }}
      >
        {loading ? (
          <div className="flex flex-col items-center py-4">
            <div className="spinner mb-4" style={{ color: colors.primary }} />
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {loadingMessage}
            </p>
          </div>
        ) : (
          <>
            {title && (
              <h3
                className="mb-3 text-center text-xl font-semibold"
                style={{ color: colors.text }}
              >
                {title}
              </h3>
            )}

            <p
              className="mb-8 text-center text-sm leading-6"
              style={{ color: colors.textSecondary }}
            >
              {message}
            </p>

            {showInput && (
              <textarea
                className="input-field mb-6 min-h-[80px] resize-none"
                placeholder={inputPlaceholder}
                value={inputValue}
                onChange={(e) => onInputChange?.(e.target.value)}
                rows={inputMultiline ? 3 : 1}
              />
            )}

            <div className="flex flex-col gap-3">
              <button
                className={`w-full rounded-xl py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                  danger
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
                disabled={confirmDisabled}
                onClick={onConfirm || onClose}
              >
                {buttonText}
              </button>

              <button
                className="w-full rounded-xl py-3.5 text-sm font-medium transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
                style={{ color: colors.textSecondary }}
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
