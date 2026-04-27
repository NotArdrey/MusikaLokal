import { useRef, useState } from "react";
import {
    IoCashOutline,
    IoChevronBack,
    IoClose,
    IoImageOutline,
    IoLocationOutline,
    IoMusicalNotesOutline,
    IoPeopleOutline,
} from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

const GENRES = [
  "Pop",
  "Rock",
  "Jazz",
  "Blues",
  "R&B",
  "Hip-Hop",
  "Classical",
  "Country",
  "Electronic",
  "Reggae",
  "Folk",
  "Metal",
  "Punk",
  "Indie",
  "Soul",
  "Funk",
  "OPM",
  "Kundiman",
  "Harana",
  "Bisrock",
  "Pinoy Hip-Hop",
  "Pinoy Jazz",
  "Latin",
  "Gospel",
  "Acoustic",
  "Alternative",
  "Disco",
  "World",
  "Experimental",
  "Ska",
];

const formatSkippedImageFeedback = (items: string[]) => {
  if (items.length === 0) return "";

  const visibleItems = items.slice(0, 4).map((item) => `- ${item}`).join("\n");
  const remainingCount = items.length - Math.min(items.length, 4);
  const remainingText =
    remainingCount > 0 ? `\n+ ${remainingCount} more photo(s) skipped.` : "";

  return `\n\nSkipped photos:\n${visibleItems}${remainingText}`;
};

export default function AddGroupPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isDuo = params.get("mode") === "duo";
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  };

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImages((prev) => [...prev, ...files]);
    setImagePreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!name || !location) {
      setAlert({
        visible: true,
        type: "error",
        title: "Missing Fields",
        message: "Name and location are required.",
      });
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      // Upload images to storage and collect public URLs
      const imageUrls: string[] = [];
      const skippedUploads: string[] = [];
      for (const file of images) {
        const ext = file.name.split(".").pop();
        const path = `groups/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("group-media")
          .upload(path, file);
        if (upErr) {
          skippedUploads.push(`${file.name}: ${upErr.message || "Upload rejected."}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("group-media")
          .getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }

      if (images.length > 0 && imageUrls.length === 0) {
        throw new Error(
          `No selected photos were uploaded.${formatSkippedImageFeedback(skippedUploads)}`,
        );
      }

      const { error } = await supabase
        .from("groups")
        .insert({
          owner_id: user.id,
          name,
          location,
          description,
          genre: selectedGenres[0] || "",
          rate: rate ? parseFloat(rate) : null,
          images: imageUrls,
        })
        .select()
        .single();
      if (error) throw error;

      setAlert({
        visible: true,
        type: skippedUploads.length > 0 ? "warning" : "success",
        title: skippedUploads.length > 0
          ? "Some Photos Skipped"
          : isDuo ? "Duo Created" : "Group Created",
        message: skippedUploads.length > 0
          ? `Your ${isDuo ? "duo" : "group"} was created, but ${skippedUploads.length} photo(s) could not be uploaded.${formatSkippedImageFeedback(skippedUploads)}`
          : `Your ${isDuo ? "duo" : "group"} has been created.`,
      });
      setTimeout(() => navigate("/manage"), skippedUploads.length > 0 ? 2500 : 1500);
    } catch (error: any) {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: error?.message || "Failed to create group.",
      });
    } finally {
      setLoading(false);
    }
  };

  const chipBg = isDark
    ? "bg-gray-700 text-gray-300"
    : "bg-gray-100 text-gray-600";
  const chipActive = "bg-indigo-500 text-white";
  const borderCol = isDark ? "#374151" : "#E5E7EB";
  const cardBg = isDark ? "#1F2937" : "#FFFFFF";

  return (
    <div className="page-container">
      <div className="content-container max-w-5xl pt-8 pb-20">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2.5 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
              Create {isDuo ? "Duo" : "Group"}
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: colors.textSecondary }}
            >
              Fill in the details to set up your {isDuo ? "duo" : "group"}{" "}
              profile
            </p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left column — Basic Info */}
          <div className="lg:col-span-3 space-y-6">
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <div className="flex items-center gap-2 mb-5">
                <IoPeopleOutline
                  size={20}
                  color={colors.primary || "#6366f1"}
                />
                <h2
                  className="text-lg font-semibold"
                  style={{ color: colors.text }}
                >
                  Basic Information
                </h2>
              </div>

              <div className="space-y-5">
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    {isDuo ? "Duo" : "Group"} Name{" "}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    className="input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`e.g. ${isDuo ? "Acoustic Duo" : "The Neon Lights"}`}
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Location <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <IoLocationOutline
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2"
                      color={colors.textSecondary}
                    />
                    <input
                      className="input-field pl-11"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, Province"
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Rate per Event (₱)
                  </label>
                  <div className="relative">
                    <IoCashOutline
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2"
                      color={colors.textSecondary}
                    />
                    <input
                      type="number"
                      className="input-field pl-11"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      placeholder="e.g. 15000"
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Description
                  </label>
                  <textarea
                    className="input-field min-h-[140px] resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={`Describe your ${isDuo ? "duo" : "group"}, what you play, your style…`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right column — Genre + Photos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Genre card */}
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <div className="flex items-center gap-2 mb-4">
                <IoMusicalNotesOutline
                  size={20}
                  color={colors.primary || "#6366f1"}
                />
                <h2
                  className="text-lg font-semibold"
                  style={{ color: colors.text }}
                >
                  Genre
                </h2>
              </div>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary }}
              >
                Select a primary genre for your {isDuo ? "duo" : "group"}
              </p>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition hover:scale-105 ${selectedGenres.includes(g) ? chipActive : chipBg}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Photos card */}
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <div className="flex items-center gap-2 mb-4">
                <IoImageOutline size={20} color={colors.primary || "#6366f1"} />
                <h2
                  className="text-lg font-semibold"
                  style={{ color: colors.text }}
                >
                  Photos
                </h2>
              </div>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary }}
              >
                Upload photos of your {isDuo ? "duo" : "group"} performing
              </p>
              <div className="grid grid-cols-3 gap-3">
                {imagePreviews.map((src, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-xl overflow-hidden"
                  >
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                    >
                      <IoClose size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed transition hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  style={{ borderColor: borderCol }}
                >
                  <IoImageOutline size={28} color={colors.textSecondary} />
                  <span
                    className="mt-1 text-xs font-medium"
                    style={{ color: colors.textSecondary }}
                  >
                    Add Photo
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageAdd}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="mt-8 flex justify-end gap-4">
          <button
            onClick={() => navigate(-1)}
            className="px-8 py-3 rounded-xl text-sm font-semibold border transition hover:bg-gray-50 dark:hover:bg-slate-700"
            style={{ borderColor: borderCol, color: colors.text }}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              `Create ${isDuo ? "Duo" : "Group"}`
            )}
          </button>
        </div>
      </div>
      <CustomAlert
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        onClose={() => setAlert((p) => ({ ...p, visible: false }))}
      />
    </div>
  );
}
