import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { logLoadTime } from "../utils/loadTimeLogger";

type InAppMediaType = "image" | "video" | "document" | "web";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];
const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "webm", "avi", "mkv"];
const DOCUMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "rtf",
];
const PREVIEWABLE_DOCUMENT_EXTENSIONS = ["pdf", "csv", "txt", "rtf"];
let activeFeedVideoPlayers = 0;

const getUrlPath = (url: string) => {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname).toLowerCase();
  } catch {
    return url.split("?")[0]?.split("#")[0]?.toLowerCase() || "";
  }
};

const getExtension = (url: string) => {
  const path = getUrlPath(url);
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || "";
};

const isPreviewableDocumentUrl = (url: string | null | undefined, mediaType: InAppMediaType | null = getInAppMediaType(url)) => {
  if (Platform.OS === "android" || mediaType !== "document") return false;
  const extension = getExtension(String(url || ""));
  return PREVIEWABLE_DOCUMENT_EXTENSIONS.includes(extension);
};

const getPreviewUri = (url: string, mediaType: InAppMediaType | null) => {
  if (mediaType !== "document" || getExtension(url) !== "pdf") return url;

  const [baseUrl] = url.split("#");
  return `${baseUrl}#toolbar=0&navpanes=0&scrollbar=0`;
};

export const getInAppMediaType = (url: string | null | undefined): InAppMediaType | null => {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return null;

  const extension = getExtension(normalizedUrl);
  if (IMAGE_EXTENSIONS.includes(extension)) return "image";
  if (VIDEO_EXTENSIONS.includes(extension)) return "video";
  if (DOCUMENT_EXTENSIONS.includes(extension)) return "document";
  if (/^https?:\/\//i.test(normalizedUrl)) return "web";

  return null;
};

export const isInAppMediaUrl = (url: string | null | undefined) => {
  const mediaType = getInAppMediaType(url);
  return mediaType !== null && !(Platform.OS === "android" && mediaType === "document");
};

interface InAppMediaViewerProps {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
}

const MediaVideo = ({ uri }: { uri: string }) => {
  // Media previews must always wait for an explicit tap on the native controls.
  // useVideoPlayer releases (and stops) the player automatically on unmount.
  const player = useVideoPlayer(uri, (videoPlayer) => videoPlayer.pause());

  return <VideoView player={player} style={styles.media} nativeControls contentFit="contain" />;
};

const InAppMediaViewer = ({ visible, uri, title, onClose }: InAppMediaViewerProps) => {
  const [loadedUri, setLoadedUri] = useState<string | null>(null);
  const mediaType = useMemo(() => getInAppMediaType(uri), [uri]);
  const canPreviewDocument = useMemo(() => isPreviewableDocumentUrl(uri, mediaType), [mediaType, uri]);
  const previewUri = useMemo(() => (uri ? getPreviewUri(uri, mediaType) : null), [mediaType, uri]);
  const loading = Boolean(
    visible &&
    uri &&
    loadedUri !== uri &&
    (mediaType === "image" || (mediaType === "document" && canPreviewDocument) || mediaType === "web"),
  );

  useEffect(() => {
    if (!visible || mediaType !== "video") {
      return;
    }

    activeFeedVideoPlayers += 1;
    logLoadTime("FeedMedia", "video-player-mounted", {
      activeVideoPlayers: activeFeedVideoPlayers,
    });

    return () => {
      activeFeedVideoPlayers = Math.max(0, activeFeedVideoPlayers - 1);
      logLoadTime("FeedMedia", "video-player-unmounted", {
        activeVideoPlayers: activeFeedVideoPlayers,
      });
    };
  }, [mediaType, visible]);

  if (!visible || !uri) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title || (mediaType === "video" ? "Video" : "Media")}
          </Text>
          <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.mediaFrame}>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={mediaType === "document" ? "#5B4BC4" : "#FFFFFF"} />
            </View>
          )}

          {uri && mediaType === "video" ? (
            <MediaVideo key={uri} uri={uri} />
          ) : uri && mediaType === "image" ? (
            <Image
              source={{ uri }}
              style={styles.media}
              resizeMode="contain"
              onLoadEnd={() => setLoadedUri(uri)}
              onError={() => setLoadedUri(uri)}
            />
          ) : previewUri && mediaType === "document" && canPreviewDocument ? (
            <View style={styles.documentFrame}>
              <WebView
                source={{ uri: previewUri }}
                style={styles.webView}
                startInLoadingState
                javaScriptEnabled
                domStorageEnabled
                nestedScrollEnabled
                setSupportMultipleWindows={false}
                onFileDownload={() => setLoadedUri(uri)}
                onShouldStartLoadWithRequest={(request) => /^https?:\/\//i.test(request.url)}
                onLoadEnd={() => setLoadedUri(uri)}
                onError={() => setLoadedUri(uri)}
              />
            </View>
          ) : uri && mediaType === "document" ? (
            <View style={styles.documentFallback}>
              <Ionicons name="document-text-outline" size={34} color="#FFFFFF" />
              <Text style={styles.unsupportedText}>
                Open this document with your device viewer.
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => void Linking.openURL(uri)}
                style={styles.openExternalButton}
              >
                <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                <Text style={styles.openExternalButtonText}>Open document</Text>
              </TouchableOpacity>
            </View>
          ) : uri && mediaType === "web" ? (
            <View style={styles.documentFrame}>
              <WebView
                source={{ uri }}
                style={styles.webView}
                startInLoadingState
                javaScriptEnabled
                domStorageEnabled
                nestedScrollEnabled
                setSupportMultipleWindows={false}
                onFileDownload={() => setLoadedUri(uri)}
                onLoadEnd={() => setLoadedUri(uri)}
                onError={() => setLoadedUri(uri)}
              />
            </View>
          ) : (
            <Text style={styles.unsupportedText}>This file cannot be previewed in-app.</Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
  },
  header: {
    position: "absolute",
    top: 44,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  mediaFrame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  media: {
    width: "100%",
    height: "78%",
  },
  documentFrame: {
    width: "100%",
    height: "78%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
  },
  webView: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingOverlay: {
    position: "absolute",
    zIndex: 1,
  },
  documentFallback: {
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 28,
  },
  openExternalButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: 23,
    backgroundColor: "#5B4BC4",
  },
  openExternalButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  unsupportedText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
});

export default InAppMediaViewer;
