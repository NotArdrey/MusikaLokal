import { useEffect, useRef, useState } from "react";
import { IoChevronBack, IoClose, IoDocumentTextOutline, IoImageOutline } from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

export default function EditGigPage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const gigId = params.get("id");
  const fileRef = useRef<HTMLInputElement>(null);
  const permitRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [newPreviews, setNewPreviews] = useState<string[]>([]);
  const [existingPermitUrl, setExistingPermitUrl] = useState<string | null>(null);
  const [newPermitFile, setNewPermitFile] = useState<File | null>(null);
  const [permitPreview, setPermitPreview] = useState<string | null>(null);
  const [permitStatus, setPermitStatus] = useState<string>("pending_review");
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!gigId) return;
    (async () => {
      const { data } = await supabase
        .from("gigs")
        .select("*")
        .eq("id", gigId)
        .single();
      if (data) {
        setName(data.name || "");
        setLocation(data.location || "");
        setDescription(data.description || "");
        setBudget(data.budget?.toString() || "");
        setEventDate(data.event_date || "");
        setExistingImages(data.images || []);
        setExistingPermitUrl(data.business_permit_url || null);
        setPermitStatus(data.permit_status || "pending_review");
      }
      setLoading(false);
    })();
  }, [gigId]);

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

  const handlePermitAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewPermitFile(file);
      setPermitPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : file.name);
    }
  };

  const handleSave = async () => {
    if (!gigId || !user) return;
    setSaving(true);
    try {
      // Upload new images
      const newUrls: string[] = [];
      for (const file of newImages) {
        const ext = file.name.split(".").pop();
        const path = `gigs/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("gig-media")
          .upload(path, file);
        if (!upErr) {
          const { data: urlData } = supabase.storage
            .from("gig-media")
            .getPublicUrl(path);
          newUrls.push(urlData.publicUrl);
        }
      }

      const allImages = [...existingImages, ...newUrls];

      // Upload new permit if provided
      let permitUrl = existingPermitUrl;
      if (newPermitFile) {
        const ext = newPermitFile.name.split(".").pop();
        const path = `permits/gigs/${crypto.randomUUID()}.${ext}`;
        const { error: permitErr } = await supabase.storage
          .from("gig-media")
          .upload(path, newPermitFile);
        if (!permitErr) {
          const { data: urlData } = supabase.storage
            .from("gig-media")
            .getPublicUrl(path);
          permitUrl = urlData.publicUrl;
        }
      }

      const updateData: any = {
        name,
        location,
        description,
        budget: parseFloat(budget),
        event_date: eventDate,
        images: allImages,
        business_permit_url: permitUrl,
      };

      if (newPermitFile && permitStatus === "rejected") {
        updateData.permit_status = "resubmitted";
        updateData.permit_rejection_reason = null;
      }

      const { error } = await supabase
        .from("gigs")
        .update(updateData)
        .eq("id", gigId);
      if (error) throw error;

      setAlert({
        visible: true,
        type: "success",
        title: "Saved",
        message: "Gig updated.",
      });
      setTimeout(() => navigate(-1), 1200);
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to update gig.",
      });
    } finally {
      setSaving(false);
    }
  };

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
      <div className="content-container max-w-4xl pt-8 pb-20">
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2.5 hover:bg-gray-100 dark:hover:bg-slate-700 transition"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
            Edit Gig
          </h1>
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
                  Name
                </label>
                <input
                  className="input-field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-sm font-medium"
                  style={{ color: colors.text }}
                >
                  Location
                </label>
                <input
                  className="input-field"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
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
                    Budget (₱)
                  </label>
                  <input
                    type="number"
                    className="input-field"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    Event Date
                  </label>
                  <input
                    type="date"
                    className="input-field"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
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
                    key={`new-${i}`}
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

        {/* Business Permit */}
        <div
          className="mt-6 rounded-2xl border p-6"
          style={{ borderColor: borderCol, backgroundColor: cardBg }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold" style={{ color: colors.text }}>
              Business Permit
            </h2>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              permitStatus === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
              permitStatus === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
              permitStatus === "resubmitted" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
              "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
            }`}>
              {permitStatus.replace("_", " ")}
            </span>
          </div>
          {permitStatus === "rejected" && (
            <p className="text-xs text-red-500 mb-3">
              Your permit was rejected. Please upload a new one to resubmit for review.
            </p>
          )}
          {(newPermitFile || existingPermitUrl) ? (
            <div className="flex items-center gap-3 rounded-xl border p-3" style={{ borderColor: borderCol }}>
              <IoDocumentTextOutline size={24} color={colors.primary} />
              <span className="flex-1 text-sm truncate" style={{ color: colors.text }}>
                {newPermitFile ? newPermitFile.name : "Current permit"}
              </span>
              {existingPermitUrl && !newPermitFile && (
                <a
                  href={existingPermitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-indigo-500 hover:underline"
                >
                  View
                </a>
              )}
              <button
                onClick={() => permitRef.current?.click()}
                className="text-xs font-medium text-indigo-500 hover:underline"
              >
                Replace
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
