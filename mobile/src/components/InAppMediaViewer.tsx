import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

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

const canUseGoogleDocsPreview = (url: string | null | undefined, mediaType: InAppMediaType | null) => {
  const normalizedUrl = String(url || "").trim();
  if (mediaType !== "document" || !/^https?:\/\//i.test(normalizedUrl)) return false;

  const extension = getExtension(normalizedUrl);
  return Platform.OS === "android" || !PREVIEWABLE_DOCUMENT_EXTENSIONS.includes(extension);
};

const isPreviewableDocumentUrl = (url: string | null | undefined, mediaType: InAppMediaType | null = getInAppMediaType(url)) => {
  const extension = getExtension(String(url || ""));
  return PREVIEWABLE_DOCUMENT_EXTENSIONS.includes(extension) || canUseGoogleDocsPreview(url, mediaType);
};

const getPreviewUri = (url: string, mediaType: InAppMediaType | null) => {
  if (canUseGoogleDocsPreview(url, mediaType)) {
    return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
  }

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

export const isInAppMediaUrl = (url: string | null | undefined) =>
  getInAppMediaType(url) !== null;

interface InAppMediaViewerProps {
  visible: boolean;
  uri: string | null;
  title?: string;
  onClose: () => void;
}

const InAppMediaViewer = ({ visible, uri, title, onClose }: InAppMediaViewerProps) => {
  const [loading, setLoading] = useState(false);
  const mediaType = useMemo(() => getInAppMediaType(uri), [uri]);
  const canPreviewDocument = useMemo(() => isPreviewableDocumentUrl(uri, mediaType), [mediaType, uri]);
  const previewUri = useMemo(() => (uri ? getPreviewUri(uri, mediaType) : null), [mediaType, uri]);

  useEffect(() => {
    if (visible) {
      setLoading(mediaType === "image" || (mediaType === "document" && canPreviewDocument) || mediaType === "web");
    }
  }, [canPreviewDocument, mediaType, visible, uri]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

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
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}

          {uri && mediaType === "video" ? (
            <Video
              source={{ uri }}
              style={styles.media}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          ) : uri && mediaType === "image" ? (
            <Image
              source={{ uri }}
              style={styles.media}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              onError={() => setLoading(false)}
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
                onFileDownload={() => setLoading(false)}
                onShouldStartLoadWithRequest={(request) => /^https?:\/\//i.test(request.url)}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                onError={() => setLoading(false)}
              />
            </View>
          ) : uri && mediaType === "document" ? (
            <Text style={styles.unsupportedText}>
              This document type cannot be previewed in-app.
            </Text>
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
                onFileDownload={() => setLoading(false)}
                onLoadStart={() => setLoading(true)}
                onLoadEnd={() => setLoading(false)}
                onError={() => setLoading(false)}
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
  unsupportedText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
});

export default InAppMediaViewer;
