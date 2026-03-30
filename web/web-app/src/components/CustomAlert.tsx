import {
    IoAlertCircle,
    IoCheckmarkCircle,
    IoInformationCircle,
    IoWarning,
} from "react-icons/io5";
import { useTheme } from "../context/ThemeContext";

export type AlertType = "error" | "success" | "warning" | "info";

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface CustomAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  buttons?: AlertButton[];
  onClose: () => void;
}

const alertConfig = {
  error: {
    Icon: IoAlertCircle,
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  success: {
    Icon: IoCheckmarkCircle,
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  warning: {
    Icon: IoWarning,
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  info: {
    Icon: IoInformationCircle,
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
};

export default function CustomAlert({
  visible,
  type = "info",
  title,
  message,
  buttons = [{ text: "OK", style: "default" }],
  onClose,
}: CustomAlertProps) {
  const { colors, isDark } = useTheme();
  if (!visible) return null;

  const config = alertConfig[type];
  const { Icon } = config;

  const getButtonClasses = (style?: string) => {
    switch (style) {
      case "cancel":
        return isDark
          ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200";
      case "destructive":
        return "bg-red-500 text-white hover:bg-red-600";
      default:
        return "bg-indigo-600 text-white hover:bg-indigo-700";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="relative w-full max-w-sm rounded-3xl p-7 shadow-2xl animate-scale-in"
        style={{ backgroundColor: isDark ? "#1F2937" : "#FFFFFF" }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border-[3px]"
            style={{
              backgroundColor: config.bgColor,
              borderColor: config.borderColor,
            }}
          >
            <Icon size={40} color={config.color} />
          </div>
        </div>

        {/* Title */}
        <h3
          className="text-center text-xl font-bold mb-3"
          style={{ color: colors.text }}
        >
          {title}
        </h3>

        {/* Message */}
        <p
          className="text-center text-sm leading-relaxed mb-6 whitespace-pre-line"
          style={{ color: colors.textSecondary }}
        >
          {message}
        </p>

        {/* Buttons */}
        <div className="flex gap-3">
          {buttons.map((button, index) => (
            <button
              key={index}
              onClick={() => {
                button.onPress?.();
                onClose();
              }}
              className={`flex-1 rounded-xl py-3.5 text-sm font-semibold transition-colors ${getButtonClasses(button.style)}`}
            >
              {button.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
