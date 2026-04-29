import { useRef, useState } from "react";
import {
    IoCalendarOutline,
    IoChevronBack,
    IoClose,
    IoDocumentTextOutline,
    IoImageOutline,
    IoLocationOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function AddGigPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const permitRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitPreview, setPermitPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

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

  const handlePermitAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPermitFile(file);
      setPermitPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : file.name);
    }
  };

  const handleSubmit = async () => {
    if (!name || !location || !eventDate || !budget) {
      setAlert({
        visible: true,
        type: "error",
        title: "Missing Fields",
        message: "Please fill in all required fields.",
      });
      return;
    }
    if (!user) return;
    setLoading(true);
    try {
      // Upload images to storage and collect public URLs
      const imageUrls: string[] = [];
      for (const file of images) {
        const ext = file.name.split(".").pop();
        const path = `gigs/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("gig-media")
          .upload(path, file);
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from("gig-media")
            .getPublicUrl(path);
          imageUrls.push(urlData.publicUrl);
        }
      }

      // Upload business permit if provided
      let permitUrl: string | null = null;
      if (permitFile) {
        const ext = permitFile.name.split(".").pop();
        const path = `permits/gigs/${crypto.randomUUID()}.${ext}`;
        const { error: permitErr } = await supabase.storage
          .from("gig-media")
          .upload(path, permitFile);
        if (!permitErr) {
          const { data: urlData } = supabase.storage
            .from("gig-media")
            .getPublicUrl(path);
          permitUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from("gigs")
        .insert({
          organizer_id: user.id,
          name,
          location,
          description,
          budget: parseFloat(budget),
          event_date: eventDate,
          status: "open",
          images: imageUrls,
          business_permit_url: permitUrl,
          permit_status: "pending_review",
        })
        .select()
        .single();
      if (error) throw error;

      setAlert({
        visible: true,
        type: "success",
        title: "Gig Created",
        message: "Your gig has been submitted for permit review.",
      });
      setTimeout(() => navigate("/my-venue"), 1500);
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to create gig.",
      });
    } finally {
      setLoading(false);
    }
  };

  const borderCol = isDark ? "#374151" : "#E5E7EB";
  const cardBg = isDark ? "#1F2937" : "#FFFFFF";

  return (
    <div className="page-container">
      <div className="content-container max-w-4xl pt-8 pb-20">
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
              Post a Gig
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: colors.textSecondary }}
            >
              Create a new gig listing to find musicians
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left — Details */}
          <div
            className="rounded-2xl border p-6"
            style={{ borderColor: borderCol, backgroundColor: cardBg }}
          >
            <h2
              className="text-lg font-semibold mb-5"
              style={{ color: colors.text }}
            >
              Gig Details
            </h2>
            <div className="space-y-5">
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: colors.text }}
                >
                  Gig Name <span className="text-red-400">*</span>
                </label>
                <input
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Wedding Reception Band"
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
                  Description
                </label>
                <textarea
                  className="input-field min-h-[120px] resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the gig, what you need…"
                />
              </div>
            </div>
          </div>

          {/* Right — Budget, Date, Photos */}
          <div className="space-y-6">
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <h2
                className="text-lg font-semibold mb-5"
                style={{ color: colors.text }}
              >
                Budget & Schedule
              </h2>
              <div className="space-y-5">
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Budget (₱) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="5000"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Event Date <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <IoCalendarOutline
                      size={20}
                      className="absolute left-4 top-1/2 -translate-y-1/2"
                      color={colors.textSecondary}
                    />
                    <input
                      type="date"
                      className="input-field pl-11"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                    />
                  </div>
                </div>
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
                    Add
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

            {/* Business Permit */}
            <div
              className="rounded-2xl border p-6"
              style={{ borderColor: borderCol, backgroundColor: cardBg }}
            >
              <h2
                className="text-lg font-semibold mb-2"
                style={{ color: colors.text }}
              >
                Business Permit
              </h2>
              <p
                className="text-xs mb-4"
                style={{ color: colors.textSecondary }}
              >
                Upload your business permit (PDF or image). Required for permit review.
              </p>
              {permitPreview ? (
                <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: borderCol }}>
                  <IoDocumentTextOutline size={24} color={colors.primary} />
                  <span className="flex-1 text-sm truncate" style={{ color: colors.text }}>
                    {permitFile?.name}
                  </span>
                  <button
                    onClick={() => { setPermitFile(null); setPermitPreview(null); }}
                    className="rounded-full p-1 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <IoClose size={16} className="text-red-400" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => permitRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  style={{ borderColor: borderCol }}
                >
                  <IoDocumentTextOutline size={32} color={colors.textSecondary} />
                  <span className="mt-2 text-sm font-medium" style={{ color: colors.textSecondary }}>
                    Upload Permit
                  </span>
                  <span className="text-xs" style={{ color: colors.muted }}>
                    PDF, JPG, or PNG
                  </span>
                </button>
              )}
              <input
                ref={permitRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={handlePermitAdd}
              />
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
            {loading ? <span className="spinner" /> : "Post Gig"}
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
