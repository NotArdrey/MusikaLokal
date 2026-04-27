import { useEffect, useRef, useState } from "react";
import {
    IoCashOutline,
    IoChevronBack,
    IoClose,
    IoImageOutline,
    IoLocationOutline,
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

export default function EditGroupPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const groupId = params.get("id");
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [rate, setRate] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!groupId) return;
    (async () => {
      const { data } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();
      if (data) {
        setName(data.name || "");
        setLocation(data.location || "");
        setDescription(data.description || "");
        setRate(data.rate?.toString() || "");
        setSelectedGenres(data.genre ? [data.genre] : []);
        setExistingImages(data.images || []);
      }
      setLoading(false);
    })();
  }, [groupId]);

  const toggleGenre = (g: string) =>
    setSelectedGenres((p) =>
      p.includes(g) ? p.filter((x) => x !== g) : [...p, g],
    );

  const handleImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setNewImages((prev) => [...prev, ...files]);
    setNewPreviews((prev) => [
      ...prev,
      ...files.map((f) => URL.createObjectURL(f)),
    ]);
  };

  const removeExisting = (idx: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  };
  const removeNew = (idx: number) => {
    setNewImages((prev) => prev.filter((_, i) => i !== idx));
    setNewPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!groupId || !user) return;
    setSaving(true);
    try {
      // Upload new images
      const newUrls: string[] = [];
      const skippedUploads: string[] = [];
      for (const file of newImages) {
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
        newUrls.push(urlData.publicUrl);
      }

      if (newImages.length > 0 && newUrls.length === 0) {
        throw new Error(
          `No selected photos were uploaded.${formatSkippedImageFeedback(skippedUploads)}`,
        );
      }

      const allImages = [...existingImages, ...newUrls];

      const { error } = await supabase
        .from("groups")
        .update({
          name,
          location,
          description,
          genre: selectedGenres[0] || "",
          rate: rate ? parseFloat(rate) : null,
          images: allImages,
        })
        .eq("id", groupId);
      if (error) throw error;

      setAlert({
        visible: true,
        type: skippedUploads.length > 0 ? "warning" : "success",
        title: skippedUploads.length > 0 ? "Some Photos Skipped" : "Saved",
        message: skippedUploads.length > 0
          ? `Group updated, but ${skippedUploads.length} photo(s) could not be uploaded.${formatSkippedImageFeedback(skippedUploads)}`
          : "Group updated.",
      });
      setTimeout(() => navigate(-1), skippedUploads.length > 0 ? 2500 : 1200);
    } catch (error: any) {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: error?.message || "Failed to update group.",
      });
    } finally {
      setSaving(false);
    }
  };

  const chipBg = isDark
    ? "bg-gray-700 text-gray-300"
    : "bg-gray-100 text-gray-600";
  const borderCol = isDark ? "#374151" : "#E5E7EB";
  const cardBg = isDark ? "#1F2937" : "#FFFFFF";

  if (loading)
    return (
      <div className="page-container">
        <div className="flex justify-center py-20">
          <span className="spinner" />
        </div>
      </div>
    );

  return (
    <div className="page-container">
      <div className="content-container max-w-5xl pt-8 pb-20">
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2.5 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
            Edit Group
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left — Basic Info */}
          <div className="lg:col-span-3">
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <h2
                className="text-lg font-semibold mb-5"
                style={{ color: colors.text }}
              >
                Basic Information
              </h2>
              <div className="space-y-5">
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Name
                  </label>
                  <input
                    className="input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Group name"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Location
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
                      placeholder="Location"
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
                    placeholder="Description"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right — Genre + Photos */}
          <div className="lg:col-span-2 space-y-6">
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: colors.text }}
              >
                Genre
              </h2>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition hover:scale-105 ${selectedGenres.includes(g) ? "bg-indigo-500 text-white" : chipBg}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: colors.text }}
              >
                Photos
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {existingImages.map((url, i) => (
                  <div
                    key={`ex-${i}`}
                    className="relative aspect-square rounded-xl overflow-hidden"
                  >
                    <img
                      src={url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => removeExisting(i)}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                    >
                      <IoClose size={14} />
                    </button>
                  </div>
                ))}
                {newPreviews.map((src, i) => (
                  <div
                    key={`n-${i}`}
                    className="relative aspect-square rounded-xl overflow-hidden"
                  >
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() => removeNew(i)}
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
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <span className="spinner" /> : "Save Changes"}
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
