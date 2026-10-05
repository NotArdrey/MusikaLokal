import Head from "expo-router/head";
import { useEffect, useRef, useState } from "react";
import { Image } from "react-native";
import { useTheme } from "../src/context/ThemeContext";
import { BRAND_LOGOS } from "../src/constants/Images";
import { parseAndroidRelease, type AndroidRelease } from "../src/utils/androidRelease";
import { downloadAndroidApk } from "../src/utils/downloadAndroidApk";
import "../src/theme/download.css";

const installationSteps = [
  ["Download the APK", "Tap Download Android APK and wait for the file to finish downloading."],
  ["Open the download", "Open the APK from your browser downloads or Files app."],
  ["Allow this installation", "If Android asks, allow installs from this browser or Files app, then return to the installer."],
  ["Install and join in", "Tap Install, then open MusikaLokal and join your local music community."],
];

export default function DownloadHomepage() {
  const { isDark, setTheme } = useTheme();
  const [release, setRelease] = useState<AndroidRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadNotice, setDownloadNotice] = useState("");
  const [device, setDevice] = useState<"android" | "ios" | "other" | null>(null);
  const [showMobileDownload, setShowMobileDownload] = useState(false);
  const downloadActions = useRef<HTMLDivElement | null>(null);
  const downloadController = useRef<AbortController | null>(null);
  useEffect(() => {
    const agent = navigator.userAgent;
    setDevice(/Android/i.test(agent) ? "android" : /iPhone|iPad|iPod/i.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : "other");
  }, []);
  useEffect(() => {
    if (!release || !downloadActions.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setShowMobileDownload(!entry.isIntersecting));
    observer.observe(downloadActions.current);
    return () => observer.disconnect();
  }, [release]);
  useEffect(() => () => downloadController.current?.abort(), []);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch("/android-release.json", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? parseAndroidRelease(await response.json()) : null)
      .then((value) => { if (mounted) setRelease(value); })
      .catch(() => { if (mounted) setRelease(null); })
      .finally(() => { clearTimeout(timeout); if (mounted) setLoading(false); });
    return () => { mounted = false; clearTimeout(timeout); controller.abort(); };
  }, []);
  const logo = isDark ? BRAND_LOGOS.dark : BRAND_LOGOS.light;
  const startDownload = async () => {
    if (!release || downloadController.current) return;
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloadProgress(0);
    setDownloadNotice("");
    try {
      const file = await downloadAndroidApk(release, setDownloadProgress, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = "MusikaLokal.apk";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloadNotice("Download ready. Open MusikaLokal.apk from your browser downloads to install.");
    } catch {
      setDownloadNotice(controller.signal.aborted ? "Download canceled." : "The download did not finish. Please try again.");
    } finally {
      downloadController.current = null;
      setDownloadProgress(null);
    }
  };

  return (
    <div className={`download-site${isDark ? " dark" : ""}`}>
      <Head><title>MusikaLokal — Your local music scene</title><meta name="description" content="Discover your local music scene with MusikaLokal. Download the Android app." /></Head>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="download-header">
        <a className="brand" href="/" aria-label="MusikaLokal home"><Image source={logo} style={{ width: 48, height: 48 }} resizeMode="contain" /><span>Musika<span className="violet-text">Lokal</span></span></a>
        <nav aria-label="Main navigation"><a href="#installation">How to install</a><button className="theme-toggle" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}>{isDark ? "☀" : "☾"}</button></nav>
      </header>
      <main id="main">
        <section className="download-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <span className="eyebrow"><span className="status-dot" /> YOUR LOCAL MUSIC SCENE</span>
            <h1 id="hero-title">Find your sound.<br /><span className="violet-text">Find your people.</span></h1>
            <p className="hero-description">Local artists. New connections. Your next gig. Bring your music community together with MusikaLokal.</p>
            <div className="download-actions" ref={downloadActions}>
              {release ? <a className="primary-download" href={release.downloadUrl} aria-disabled={downloadProgress !== null} onClick={(event) => { event.preventDefault(); void startDownload(); }}><span aria-hidden="true">↓</span> {downloadProgress !== null ? `Downloading… ${downloadProgress}%` : "Download Android APK"}</a> : <button className="primary-download" disabled>{loading ? "Checking availability…" : "Download unavailable"}</button>}
              {downloadProgress !== null ? <button className="cancel-download" onClick={() => downloadController.current?.abort()}>Cancel</button> : null}
            </div>
            <p className="release-description" role="status">{release ? `Version ${release.versionName} · ${(release.sizeBytes / 1024 / 1024).toFixed(1)} MB · ${release.minSdk === 24 ? "Android 7.0+" : `Android API ${release.minSdk}+`}` : loading ? "Finding the latest Android download." : "The Android app is not available to download right now. Please check back soon."}</p>
            <p className="standalone-note">Available for 64-bit Android devices.</p>
            {device ? <p className="device-note">{device === "android" ? "Keep this page open until your download is ready." : device === "ios" ? "This app is for Android. Open this page on your Android phone to install." : "Open this page on your Android phone, or download here and transfer the APK."}</p> : null}
            {downloadProgress !== null ? <div className="download-progress"><progress aria-label="APK download progress" value={downloadProgress} max={100} /><span>{downloadProgress === 100 ? "Preparing your file…" : `${downloadProgress}% downloaded`}</span></div> : null}
            <p className="download-notice" aria-live="polite">{downloadProgress !== null ? "Keep this page open. Your file will be saved when the download is complete." : downloadNotice}</p>
          </div>
          <div className="hero-art" aria-label="MusikaLokal logo">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="logo-card"><Image source={logo} accessibilityLabel="MusikaLokal" style={{ width: 250, height: 250, maxWidth: "100%" }} resizeMode="contain" /><span className="logo-caption">Made for the local scene.</span></div>
            <span className="scene-tag tag-top">♫ Music brings us together</span><span className="scene-tag tag-bottom">Your next connection starts here ↗</span>
          </div>
        </section>
        <section className="feature-strip" aria-label="Explore MusikaLokal">
          <article><span className="feature-number">01</span><h2>Discover local talent</h2><p>Explore the artists and sounds around you.</p></article>
          <article><span className="feature-number">02</span><h2>Connect through music</h2><p>Meet musicians and find your community.</p></article>
          <article><span className="feature-number">03</span><h2>Find your next gig</h2><p>Discover opportunities to take the stage.</p></article>
        </section>
        <section className="installation-section" id="installation" aria-labelledby="installation-title">
          <div className="section-heading"><span className="eyebrow">READY WHEN YOU ARE</span><h2 id="installation-title">From download to your first note.</h2><p>Get MusikaLokal on your Android phone. Download the APK, then follow these steps to install the app.</p></div>
          <div className="installation-grid">{installationSteps.map(([title, detail], index) => <details className="installation-step" key={title} open={index === 0}><summary><span className="step-number">{index + 1}</span><h3>{title}</h3><span className="step-toggle" aria-hidden="true">+</span></summary><p>{detail}</p></details>)}</div>
          {release ? <details className="file-details"><summary>File information</summary><dl><dt>Updated</dt><dd>{new Date(release.builtAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" })}</dd><dt>SHA-256</dt><dd><code>{release.sha256}</code></dd></dl></details> : null}
        </section>
      </main>
      <footer className="download-footer"><span>MusikaLokal · Local sounds. Shared stories.</span></footer>
      {release && showMobileDownload ? <aside className="mobile-download" aria-label="Quick download">
        {downloadProgress !== null ? <><div className="mobile-download-progress"><span>{downloadProgress === 100 ? "Preparing your file…" : `Downloading… ${downloadProgress}%`}</span><progress aria-label="Quick download progress" value={downloadProgress} max={100} /></div><button className="cancel-download" onClick={() => downloadController.current?.abort()}>Cancel download</button></> : <><a className="mobile-install-link" href="#installation">Install guide</a><button className="primary-download" onClick={() => void startDownload()}><span aria-hidden="true">↓</span> Download app</button></>}
      </aside> : null}
    </div>
  );
}
