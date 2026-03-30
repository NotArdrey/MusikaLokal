import { useEffect, useRef, useState } from "react";
import {
    IoCameraOutline,
    IoChevronBack,
    IoLocationOutline,
    IoMusicalNotesOutline,
    IoPersonOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import CustomAlert from "../components/CustomAlert";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../lib/supabase";

const ROLES_LIST = [
  "Vocalist",
  "Guitarist",
  "Bassist",
  "Drummer",
  "Keyboardist",
  "Pianist",
  "Violinist",
  "Cellist",
  "Saxophonist",
  "Trumpeter",
  "Flutist",
  "DJ",
  "Producer",
  "Sound Engineer",
  "Session Musician",
  "Composer",
  "Arranger",
  "Music Teacher",
  "Band Manager",
  "Rapper",
  "Beatboxer",
];

const GENRES_LIST = [
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
];

export default function EditProfilePage() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as "info" | "error" | "success" | "warning",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        setName(data.full_name || "");
        setBio(data.bio || "");
        setLocation(data.location || "");
        setSelectedRoles(data.skills || data.musical_roles || []);
        setSelectedGenres(data.genres || []);
        setAvatarUrl(data.avatar_url || "");
      }
      setLoading(false);
    })();
  }, [user]);

  const toggleItem = (
    list: string[],
    setList: (v: string[]) => void,
    item: string,
  ) => {
    setList(
      list.includes(item) ? list.filter((x) => x !== item) : [...list, item],
    );
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      setAvatarUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let newAvatarUrl = avatarUrl;
      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop();
        const path = `avatars/${user.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("profile-images")
          .upload(path, avatarFile, { upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from("profile-images")
            .getPublicUrl(path);
          newAvatarUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: name,
          bio,
          location,
          skills: selectedRoles,
          genres: selectedGenres,
          avatar_url: newAvatarUrl,
        })
        .eq("id", user.id);

      if (error) throw error;
      setAlert({
        visible: true,
        type: "success",
        title: "Saved",
        message: "Profile updated.",
      });
      setTimeout(() => navigate(-1), 1200);
    } catch {
      setAlert({
        visible: true,
        type: "error",
        title: "Error",
        message: "Failed to save profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="page-container">
        <div className="flex justify-center py-20">
          <span className="spinner" />
        </div>
      </div>
    );

  const chipBg = isDark
    ? "bg-gray-700 text-gray-300"
    : "bg-gray-100 text-gray-600";
  const chipActive = "bg-indigo-500 text-white";

  return (
    <div className="page-container">
      <div className="content-container max-w-4xl pt-6 pb-32">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-full p-2.5 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <IoChevronBack size={24} color={colors.text} />
          </button>
          <h1 className="text-2xl font-bold" style={{ color: colors.text }}>
            Edit Profile
          </h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Avatar Card */}
          <div className="lg:col-span-1">
            <div className="card sticky top-24">
              <div className="flex flex-col items-center py-4">
                <div className="relative mb-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="h-32 w-32 rounded-full object-cover ring-4 ring-indigo-100 dark:ring-indigo-900/30"
                    />
                  ) : (
                    <div className="flex h-32 w-32 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30 ring-4 ring-indigo-50 dark:ring-indigo-900/10">
                      <IoPersonOutline size={48} className="text-indigo-400" />
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-transform hover:scale-110"
                  >
                    <IoCameraOutline size={20} />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>
                <p
                  className="text-sm font-medium"
                  style={{ color: colors.textSecondary }}
                >
                  Click to change photo
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info Card */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <IoPersonOutline size={20} color={colors.primary} />
                <h2
                  className="text-base font-bold"
                  style={{ color: colors.text }}
                >
                  Basic Information
                </h2>
              </div>

              <div className="space-y-5">
                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.textSecondary }}
                  >
                    Full Name
                  </label>
                  <input
                    className="input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.textSecondary }}
                  >
                    Bio
                  </label>
                  <textarea
                    className="input-field min-h-[120px] resize-none"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                  />
                </div>

                <div>
                  <label
                    className="mb-1.5 block text-sm font-medium"
                    style={{ color: colors.textSecondary }}
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
                      placeholder="City, Province"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Musical Roles Card */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <IoMusicalNotesOutline size={20} color={colors.primary} />
                <h2
                  className="text-base font-bold"
                  style={{ color: colors.text }}
                >
                  Musical Roles
                </h2>
              </div>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary }}
              >
                Select the roles that describe you
              </p>
              <div className="flex flex-wrap gap-2.5">
                {ROLES_LIST.map((role) => (
                  <button
                    key={role}
                    onClick={() =>
                      toggleItem(selectedRoles, setSelectedRoles, role)
                    }
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${selectedRoles.includes(role) ? chipActive : chipBg} hover:shadow-sm`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Genres Card */}
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <IoMusicalNotesOutline size={20} color={colors.primary} />
                <h2
                  className="text-base font-bold"
                  style={{ color: colors.text }}
                >
                  Genres
                </h2>
              </div>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary }}
              >
                Select the genres you play or enjoy
              </p>
              <div className="flex flex-wrap gap-2.5">
                {GENRES_LIST.map((genre) => (
                  <button
                    key={genre}
                    onClick={() =>
                      toggleItem(selectedGenres, setSelectedGenres, genre)
                    }
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${selectedGenres.includes(genre) ? chipActive : chipBg} hover:shadow-sm`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <button
              className="btn-primary w-full lg:w-auto lg:px-16"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <span className="spinner" /> : "Save Changes"}
            </button>
          </div>
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
