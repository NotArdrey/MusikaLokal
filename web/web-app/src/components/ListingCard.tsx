import { useTheme } from "../context/ThemeContext";

interface ListingCardProps {
  id: string;
  title: string;
  subtitle?: string;
  type: "Studio" | "Gig" | "Group" | "Artist";
  image?: string | null;
  images?: string[];
  rating?: number;
  location?: string;
  price?: number | string;
  tags?: string[];
  permitStatus?: string;
  onPress?: () => void;
}

const typeBadgeColors: Record<string, string> = {
  Studio:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Gig: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Group: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Artist: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
};

export default function ListingCard({
  id: _id,
  title,
  subtitle,
  type,
  image,
  images,
  rating,
  location,
  price,
  tags,
  permitStatus,
  onPress,
}: ListingCardProps) {
  const { colors, isDark } = useTheme();
  const displayImage = image || images?.[0];
  const isBookable = !permitStatus || permitStatus === "approved" || type === "Group" || type === "Artist";

  return (
    <button
      onClick={isBookable ? onPress : undefined}
      className={`group w-full text-left overflow-hidden rounded-2xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
        isBookable
          ? "hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
          : "opacity-75 cursor-not-allowed"
      }`}
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
      }}
      disabled={!isBookable}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-100 dark:bg-slate-700">
        {displayImage ? (
          <img
            src={displayImage}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400 dark:text-slate-500">
            <svg
              className="h-10 w-10"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Type badge */}
        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${typeBadgeColors[type] || typeBadgeColors.Studio}`}
        >
          {type}
        </span>

        {/* Rating */}
        {rating !== undefined && rating > 0 && (
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            ⭐ {rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3
          className="truncate text-base font-semibold"
          style={{ color: colors.text }}
        >
          {title}
        </h3>

        {subtitle && (
          <p
            className="mt-1 truncate text-sm"
            style={{ color: colors.textSecondary }}
          >
            {subtitle}
          </p>
        )}

        {location && (
          <p
            className="mt-1.5 flex items-center gap-1 text-sm"
            style={{ color: colors.muted }}
          >
            <span>📍</span>
            <span className="truncate">{location}</span>
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          {price !== undefined && (
            <span
              className="text-base font-bold"
              style={{ color: colors.primary }}
            >
              {typeof price === "number" ? `₱${price.toLocaleString()}` : price}
            </span>
          )}

          {permitStatus && permitStatus !== "approved" && (type === "Studio" || type === "Gig") && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              Pending Approval
            </span>
          )}

          {tags && tags.length > 0 && (
            <div className="flex gap-1.5">
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "#F3F4F6",
                    color: colors.textSecondary,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
