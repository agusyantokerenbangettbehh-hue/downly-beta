const platformDomains = {
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch", "fb.com"],
  twitter: ["twitter.com", "x.com"]
};

const platformNames = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "X / Twitter"
};

const ACCENTS = ["mono", "biru", "hijau", "merah", "ungu", "oranye", "pink"];
const CORS_PROXY = "https://downly-proxy.hamzxxenrique2.workers.dev/?url=";
const BACKEND_BASE = "https://downly-backend.de1.netrun.io";
const MAX_BATCH = 20;
const HISTORY_KEY = "downly_history_v3";
const SETTINGS_KEY = "downly_settings_v3";

const form = document.getElementById("formdownload");
const urlInput = document.getElementById("url");
const urlBox = document.getElementById("urlBox");
const urlMulti = document.getElementById("urlMulti");
const urlLabel = document.getElementById("urlLabel");
const modeSingle = document.getElementById("modeSingle");
const modeBatch = document.getElementById("modeBatch");
const batchList = document.getElementById("batchList");
const downloadBtn = document.getElementById("downloadBtn");
const statusDownload = document.getElementById("statusDownload");
const resultSection = document.getElementById("hasil");
const resultCard = document.querySelector(".result-card");
const thumbnail = document.getElementById("thumbnailMedia");
const videoMedia = document.getElementById("videoMedia");
const photoGallery = document.getElementById("galeriFoto");
const mediaBadge = document.getElementById("mediaBadge");
const title = document.getElementById("judulMedia");
const caption = document.getElementById("captionMedia");
const audioMedia = document.getElementById("audioMedia");
const downloadMedia = document.getElementById("downloadMedia");
const qualitySelect = document.getElementById("qualitySelect");
const downloadAllPhotos = document.getElementById("downloadAllPhotos");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const darkModeInput = document.getElementById("darkMode");
const autoPasteInput = document.getElementById("autoPaste");
const saveHistoryInput = document.getElementById("saveHistory");
const installBtn = document.getElementById("installApp");

function updateProgressBar(percent) {
  const container = document.getElementById("progressContainer");
  const bar = document.getElementById("progressBar");
  if (!container || !bar) return;
  
  if (percent === null || percent === undefined) {
    container.hidden = true;
    bar.style.width = "0%";
    bar.style.opacity = "1";
    return;
  }
  
  container.hidden = false;

  if (percent === "loading") {
    bar.style.width = "100%";
    bar.style.opacity = "0.3"; 
  } else {
    bar.style.opacity = "1";
    bar.style.width = Math.round(percent * 100) + "%";
  }
}

let currentMedia = null;
let batchMode = false;
let selectMode = false;
let visibleIds = [];
let lastClipboard = "";
const selected = new Set();
let deferredPrompt;

let settings = loadSettings();
let history = loadHistory();

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      darkMode: s?.darkMode ?? false,
      saveHistory: s?.saveHistory ?? true,
      autoPaste: s?.autoPaste ?? true,
      accent: ACCENTS.includes(s?.accent) ? s.accent : "mono"
    };
  } catch {
    return { darkMode: false, saveHistory: true, autoPaste: true, accent: "mono" };
  }
}

function storeSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

function loadHistory() {
  try {
    const s = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(s) ? s : [];
  } catch { return []; }
}

function persistHistory() {
  try {
    if (settings.saveHistory) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  } catch {}
}

function showStatus(msg) {
  statusDownload.textContent = msg;
}

function showToast(msg, dur = 2600) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), dur);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeMediaUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!["https:", "http:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    const platform = Object.entries(platformDomains).find(
      ([, domains]) => domains.some(domain => host === domain || host.endsWith("." + domain))
    )?.[0];
    if (!platform) return null;
    if (platform === "instagram") { url.search = ""; url.hash = ""; }
    return url.toString();
  } catch { return null; }
}

function detectPlatform(value) {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  const host = new URL(normalized).hostname.toLowerCase();
  for (const [platform, domains] of Object.entries(platformDomains)) {
    if (domains.some(domain => host === domain || host.endsWith("." + domain))) return platform;
  }
  return null;
}

function extractUrls(text) {
  return [...new Set((String(text || "").match(/https?:\/\/[^\s<>"']+/gi) || []).map(link => link.replace(/[),.;]+$/, "")))];
}

function absoluteUrl(value) {
  if (!value) return "";
  if (value.startsWith("//")) return "https:" + value;
  if (value.startsWith("/")) return "https://www.tikwm.com" + value;
  return value;
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) { hash = (hash * 31 + text.charCodeAt(i)) | 0; }
  return Math.abs(hash).toString(36);
}

function safeName(text) {
  return String(text || "").replace(/[\\/:*?"<>|#\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "downly";
}

function extFromType(type, fallback) {
  const extensions = {
    "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3",
    "audio/mp4": "m4a", "audio/aac": "aac", "image/jpeg": "jpg",
    "image/png": "png", "image/webp": "webp"
  };
  return extensions[(type || "").split(";")[0].trim()] || fallback;
}

function mediaBaseName() {
  const customName = document.getElementById("customFilename")?.value;
  return safeName(customName || currentMedia?.title);
}

function usesBackend(media) {
  return Boolean(media) && (media.source === "backend" || media.platform !== "tiktok");
}

function getQualities(media) {
  return (Array.isArray(media.qualities) && media.qualities.length)
    ? media.qualities
    : media.video ? [{ label: "Video", url: media.video }] : [];
}

async function fetchJson(url) {
  let error;
  for (const target of [url, CORS_PROXY + encodeURIComponent(url)]) {
    try {
      const response = await fetch(target);
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } catch (e) { error = e; }
  }
  throw error || new Error("Gagal mengambil data.");
}

async function fetchBlob(url, onProgress) {
  let error;
  for (const target of [url, CORS_PROXY + encodeURIComponent(url)]) {
    try {
      const response = await fetch(target);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const total = Number(response.headers.get("content-length")) || 0;

      if (!response.body || !onProgress) return await response.blob();

      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;

        if (total > 0) {
          onProgress(loaded / total);
        } else {
          onProgress("loading");
        }
      }

      return new Blob(chunks, { type: response.headers.get("content-type") || "" });
    } catch (e) { error = e; }
  }
  throw error || new Error("Gagal mengambil file.");
}

const BACKEND_WAIT_TIMEOUT = 240000;
const BACKEND_IDLE_TIMEOUT = 45000;
const BACKEND_INFO_TIMEOUT = 90000;

function buildBackendUrl(mediaUrl, formatId, mode = "video") {
  let link = `${BACKEND_BASE}/api/download?url=${encodeURIComponent(mediaUrl)}`;
  if (formatId) link += `&format_id=${encodeURIComponent(formatId)}`;
  if (mode === "audio") link += "&mode=audio";
  return link;
}

function buildProxyUrl(mediaUrl) {
  return `${BACKEND_BASE}/api/proxy?url=${encodeURIComponent(mediaUrl)}`;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Server timeout.");
    throw new Error("Server terputus.");
  } finally { clearTimeout(timer); }
}

function filenameFromDisposition(header) {
  if (!header) return "";
  const encoded = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (encoded) { try { return decodeURIComponent(encoded[1].trim()); } catch {} }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/);
  return plain ? plain[1].trim() : "";
}

async function downloadFromBackend(fullUrl, { baseName, fallbackExt = "mp4", onProgress, onPhase } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const arm = ms => setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  let timer = arm(BACKEND_WAIT_TIMEOUT);
  const started = Date.now();
  const ticker = onPhase ? setInterval(() => onPhase(Math.round((Date.now() - started) / 1000)), 1000) : null;
  if (onPhase) onPhase(0);

  let response;
  try {
    response = await fetch(fullUrl, { signal: controller.signal });
  } catch {
    clearTimeout(timer);
    if (ticker) clearInterval(ticker);
    throw new Error(timedOut ? "Server terlalu lama." : "Server terputus.");
  }

  if (ticker) clearInterval(ticker);
  if (!response.ok) {
    clearTimeout(timer);
    let detail = "";
    try { detail = (await response.json()).detail || ""; } catch {}
    throw new Error(detail || "Server error (HTTP " + response.status + ")");
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const contentType = response.headers.get("content-type") || "";
  const serverName = filenameFromDisposition(response.headers.get("content-disposition"));
  const chunks = [];
  let loaded = 0;

  try {
    if (!response.body) {
      clearTimeout(timer);
      chunks.push(await response.blob());
    } else {
      const reader = response.body.getReader();
      for (;;) {
        clearTimeout(timer);
        timer = arm(BACKEND_IDLE_TIMEOUT);
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (onProgress) {
          onProgress(total ? loaded / total : "loading");
        }
      }
    }
  } catch {
    throw new Error(timedOut ? "Koneksi timeout." : "Unduhan terputus.");
  } finally { clearTimeout(timer); }

  const blob = new Blob(chunks, { type: contentType });
  if (!blob.size) throw new Error("File kosong.");
  if (total && loaded && loaded < total) throw new Error("File tidak lengkap.");
  const match = serverName.match(/\.([a-z0-9]{2,4})$/i);
  const extension = (match && match[1]) || extFromType(contentType, fallbackExt);
  saveBlob(blob, `${baseName || "downly"}.${extension}`);
}

async function downloadFile(url, baseName, fallbackExt, button, idleLabel) {
  if (button.dataset.busy) return;
  button.dataset.busy = "1";
  button.classList.add("is-loading");

  const originalLabel = idleLabel || button.textContent;
  button.textContent = "Menyiapkan download…";

  const container = document.getElementById("progressContainer");
  const bar = document.getElementById("progressBar");
  if (container) container.hidden = false;
  if (bar) { bar.style.width = "0%"; bar.style.opacity = "1"; }

  try {
    if (currentMedia && usesBackend(currentMedia) && url.startsWith(BACKEND_BASE)) {
      await downloadFromBackend(url, {
        baseName, fallbackExt,
        onProgress: (progress) => {
          if (progress === "loading") {
            button.textContent = "Mengunduh...";
            updateProgressBar("loading");
          } else if (progress !== null) {
            button.textContent = "Mengunduh " + Math.round(progress * 100) + "%";
            updateProgressBar(progress);
          }
        },
        onPhase: seconds => { button.textContent = "Memproses server… " + seconds + " d"; }
      });
    } else {
      const blob = await fetchBlob(url, progress => {
        if (progress === "loading") {
          button.textContent = "Mengunduh...";
          updateProgressBar("loading");
        } else if (progress !== null) {
          button.textContent = "Mengunduh " + Math.round(progress * 100) + "%";
          updateProgressBar(progress);
        }
      });
      saveBlob(blob, `${baseName || "downly"}.${extFromType(blob.type, fallbackExt)}`);
    }
    showToast("Download berhasil ✓");
  } catch (error) {
    console.error("Download error:", error);
    showToast(error.message || "Download gagal.");
  } finally {
    delete button.dataset.busy;
    button.classList.remove("is-loading");
    button.textContent = originalLabel;
    updateProgressBar(null);
  }
}

function saveBlob(blob, filename) {
  const forced = new Blob([blob], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(forced);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.target = "_self";
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

async function downloadMediaItem(media, onProgress, onPhase) {
  const base = safeName(media.title);
  const images = Array.isArray(media.images) ? media.images : [];
  if (images.length) {
    for (let i = 0; i < images.length; i++) {
      const blob = await fetchBlob(images[i]);
      saveBlob(blob, `${base}-${i + 1}.${extFromType(blob.type, "jpg")}`);
      onProgress((i + 1) / images.length);
      await sleep(400);
    }
    return;
  }
  const qualities = getQualities(media);
  const best = qualities[0];
  if (usesBackend(media)) {
    await downloadFromBackend(buildBackendUrl(media.url, best?.format_id), {
      baseName: base, fallbackExt: "mp4", onPhase,
      onProgress: progress => onProgress(progress ?? 0)
    });
    return;
  }
  const target = best?.url || media.cover;
  if (!target) throw new Error("Media tidak ditemukan.");
  const blob = await fetchBlob(target, onProgress);
  saveBlob(blob, `${base}.${extFromType(blob.type, best ? "mp4" : "jpg")}`);
}

async function requestTikwm(url, canRetry = true) {
  const response = await fetchJson("https://www.tikwm.com/api/?hd=1&url=" + encodeURIComponent(url));
  if (response.code !== 0 || !response.data) {
    if (canRetry && /limit/i.test(response.msg || "")) {
      await sleep(1500);
      return requestTikwm(url, false);
    }
    throw new Error(response.msg || "Media tidak ditemukan.");
  }
  return response.data;
}

async function getTikTokMedia(url) {
  const data = await requestTikwm(url);
  const qualities = [
    { label: "HD", url: absoluteUrl(data.hdplay) },
    { label: "Standar", url: absoluteUrl(data.play) },
    { label: "Dengan watermark", url: absoluteUrl(data.wmplay) }
  ].filter((item, index, array) => item.url && array.findIndex(other => other.url === item.url) === index);

  return {
    id: String(data.id || Date.now()), platform: "tiktok", url,
    title: data.title || "Media TikTok",
    cover: absoluteUrl(data.cover || data.origin_cover || ""),
    video: qualities[0]?.url || "", qualities,
    audio: absoluteUrl(data.music || ""),
    images: Array.isArray(data.images) ? data.images.filter(Boolean).map(absoluteUrl) : [],
    date: new Date().toISOString(), favorite: false
  };
}

async function getBackendMedia(url, platform) {
  const response = await fetchWithTimeout(`${BACKEND_BASE}/api/info?url=${encodeURIComponent(url)}`, BACKEND_INFO_TIMEOUT);
  if (!response.ok) throw new Error("Server error HTTP " + response.status);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Gagal mengambil media.");
  const qualities = (data.qualities || []).map(item => ({
    label: item.label, url: item.url, format_id: item.format_id, has_audio: Boolean(item.has_audio)
  }));
  const audioVideo = qualities.find(item => item.has_audio);
  return {
    id: platform + "-" + hashString(url), platform, source: "backend", url,
    title: data.title || "Media " + platformNames[platform],
    cover: data.cover || data.thumbnail || "", video: data.video || audioVideo?.url || "",
    qualities, audio: data.audio || "", images: data.images || [],
    date: new Date().toISOString(), favorite: false
  };
}

async function resolveMedia(url) {
  url = normalizeMediaUrl(url);
  const platform = detectPlatform(url);
  if (!platform) throw new Error("URL tidak valid atau platform tidak didukung.");
  if (platform === "tiktok") {
    try { return await getTikTokMedia(url); }
    catch (error) {
      console.warn("TikWM gagal, mencoba backend:", error);
      return getBackendMedia(url, platform);
    }
  }
  return getBackendMedia(url, platform);
}

function setMode(batch) {
  batchMode = batch;
  urlBox.hidden = batch;
  urlMulti.hidden = !batch;
  urlInput.required = !batch;
  batchList.hidden = true;
  batchList.innerHTML = "";
  modeSingle.setAttribute("aria-pressed", String(!batch));
  modeBatch.setAttribute("aria-pressed", String(batch));
  urlLabel.htmlFor = batch ? "urlMulti" : "url";
  urlLabel.textContent = batch ? "Tempel banyak tautan" : "Tempel tautan";
  downloadBtn.textContent = batch ? "Download semua" : "Ambil media";
  showStatus(batch ? `Satu tautan per baris, maksimal ${MAX_BATCH}.` : "Masukkan tautan di atas.");
}

modeSingle.addEventListener("click", () => setMode(false));
modeBatch.addEventListener("click", () => setMode(true));

function setBusy(busy) {
  downloadBtn.disabled = busy;
  downloadBtn.textContent = busy ? "Memproses…" : batchMode ? "Download semua" : "Ambil media";
}

async function runBatch(urls) {
  batchList.innerHTML = "";
  batchList.hidden = false;
  const statuses = urls.map(url => {
    const row = document.createElement("li");
    const link = document.createElement("span");
    const status = document.createElement("strong");
    link.className = "batch-url"; link.textContent = url;
    status.className = "batch-status"; status.textContent = "Menunggu";
    row.append(link, status); batchList.appendChild(row);
    return status;
  });

  let success = 0;
  for (let index = 0; index < urls.length; index++) {
    const status = statuses[index];
    try {
      status.textContent = "Mengambil media…";
      const media = await resolveMedia(urls[index]);
      addHistory(media);
      await downloadMediaItem(media,
        progress => { status.textContent = "Mengunduh " + Math.round(progress * 100) + "%"; },
        seconds => { status.textContent = "Memproses server… " + seconds + " d"; }
      );
      status.textContent = "Selesai ✓"; success++;
    } catch (error) {
      console.error("Batch download gagal:", error);
      status.textContent = "Gagal: " + (error.message || "Error");
    }
    if (index < urls.length - 1) await sleep(1200);
  }
  showToast(`${success} dari ${urls.length} tautan selesai`);
  showStatus(`Selesai: ${success} berhasil, ${urls.length - success} gagal.`);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (batchMode) {
    const urls = [...new Set(extractUrls(urlMulti.value).map(normalizeMediaUrl).filter(Boolean).filter(detectPlatform))].slice(0, MAX_BATCH);
    if (!urls.length) { showStatus("Tidak ada tautan yang didukung."); return; }
    setBusy(true); showStatus(`Memproses ${urls.length} tautan…`);
    try { await runBatch(urls); } finally { setBusy(false); }
    return;
  }

  const url = normalizeMediaUrl(urlInput.value);
  const platform = detectPlatform(url);
  if (!platform) { showStatus("URL tidak valid."); return; }

  setBusy(true); showStatus("Mengambil media dari " + platformNames[platform] + "…");
  try {
    const media = await resolveMedia(url);
    currentMedia = media;
    displayMedia(media);
    addHistory(media);
    updateFavoriteButton();
    showStatus("Media berhasil diambil.");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Downly resolver error:", error);
    showStatus(error.message || "Gagal mengambil media. Coba lagi nanti.");
  } finally { setBusy(false); }
});

function displayMedia(media) {
  resultSection.hidden = false;
  const images = media.images || [];
  const qualities = getQualities(media);
  const downloadUrl = media.video || qualities[0]?.url || "";
  const playableUrl = media.video || qualities.find(q => q.has_audio)?.url || qualities[0]?.url || "";
  const mainFormatId = qualities[0]?.format_id || "";
  const hasImages = images.length > 0;
  const hasVideo = Boolean(downloadUrl || qualities.length);

  title.textContent = media.title || "Media";
  caption.textContent = media.title || "";

  videoMedia.pause(); stopPreviewAudio();
  videoMedia.removeAttribute("src"); videoMedia.removeAttribute("poster");
  videoMedia.onerror = null; videoMedia.hidden = true;
  thumbnail.hidden = true; thumbnail.removeAttribute("src");
  photoGallery.innerHTML = ""; photoGallery.hidden = true;
  qualitySelect.innerHTML = ""; qualitySelect.hidden = true;
  downloadAllPhotos.hidden = true; mediaBadge.hidden = true;

  if (hasImages) {
    resultCard.dataset.type = "photo"; photoGallery.hidden = false;
    renderPhotoGallery(images);
    mediaBadge.textContent = images.length + " foto"; mediaBadge.hidden = false;
    configureMediaLink(downloadMedia, downloadUrl, "Download video", "mp4", mainFormatId);
  } else if (hasVideo) {
    resultCard.dataset.type = "video";
    const previewQuality = qualities.find(q => q.has_audio) || qualities.find(q => q.url === playableUrl) || qualities[0] || { url: playableUrl };
    if (playableUrl || previewQuality.url) {
      videoMedia.hidden = false;
      if (media.cover) videoMedia.poster = media.cover;
      videoMedia.preload = "metadata";
      startPreview(media, previewQuality);
      videoMedia.onerror = () => {
        videoMedia.pause(); stopPreviewAudio();
        videoMedia.hidden = true; videoMedia.removeAttribute("src");
        if (media.cover) { thumbnail.hidden = false; thumbnail.src = media.cover; }
      };
    } else if (media.cover) {
      thumbnail.hidden = false; thumbnail.src = media.cover;
    }
    mediaBadge.textContent = "Video"; mediaBadge.hidden = false;
    configureMediaLink(downloadMedia, downloadUrl, "Download video", "mp4", mainFormatId);
  } else if (media.cover) {
    resultCard.dataset.type = "image"; thumbnail.hidden = false; thumbnail.src = media.cover;
    mediaBadge.textContent = "Gambar"; mediaBadge.hidden = false;
    configureMediaLink(downloadMedia, media.cover, "Download gambar", "jpg");
  } else {
    resultCard.dataset.type = "empty"; downloadMedia.hidden = true;
  }

  if (hasVideo && qualities.length > 1) {
    qualities.forEach((quality, index) => {
      const option = document.createElement("option");
      option.value = String(index); option.textContent = quality.label;
      qualitySelect.appendChild(option);
    });
    qualitySelect.value = "0"; qualitySelect.hidden = false;
  }

  configureMediaLink(audioMedia, usesBackend(media) ? media.url : media.audio, "Download audio", "mp3", "", "audio");
  downloadAllPhotos.hidden = !hasImages;

  const customFilename = document.getElementById("customFilename");
  const copyCaption = document.getElementById("copyCaption");
  if (customFilename) {
    customFilename.hidden = false;
    customFilename.value = media.title || "";
  }
  if (copyCaption) {
    copyCaption.hidden = false;
  }

  updateFavoriteButton();
}

qualitySelect.addEventListener("change", () => {
  if (!currentMedia) return;
  const quality = getQualities(currentMedia)[Number(qualitySelect.value)];
  if (quality) {
    configureMediaLink(downloadMedia, quality.url, "Download video", "mp4", quality.format_id);
    if (!currentMedia.images?.length && quality.url) startPreview(currentMedia, quality);
  }
});

const previewAudio = new Audio();
previewAudio.preload = "auto";
let syncAudio = false;

function stopPreviewAudio() {
  syncAudio = false;
  previewAudio.pause();
  previewAudio.removeAttribute("src");
  previewAudio.load();
}

function startPreview(media, quality) {
  stopPreviewAudio();
  const raw = quality?.url || media.video || "";
  if (!raw) return false;
  videoMedia.muted = false; videoMedia.volume = 1;
  if (!usesBackend(media)) { videoMedia.src = raw; videoMedia.load(); return true; }
  videoMedia.src = buildProxyUrl(raw);
  videoMedia.load();
  if (quality && quality.has_audio === false && media.audio) {
    syncAudio = true;
    previewAudio.src = buildProxyUrl(media.audio);
    previewAudio.load();
  }
  return true;
}

function syncPreviewAudio() {
  if (!syncAudio) return;
  if (Math.abs(previewAudio.currentTime - videoMedia.currentTime) > 0.3) previewAudio.currentTime = videoMedia.currentTime;
}

videoMedia.addEventListener("play", () => { if (!syncAudio) return; previewAudio.currentTime = videoMedia.currentTime; previewAudio.play().catch(() => {}); });
videoMedia.addEventListener("playing", () => { if (!syncAudio) return; syncPreviewAudio(); previewAudio.play().catch(() => {}); });
["pause", "waiting", "ended"].forEach(name => { videoMedia.addEventListener(name, () => { if (syncAudio) previewAudio.pause(); }); });
videoMedia.addEventListener("seeked", syncPreviewAudio);
videoMedia.addEventListener("timeupdate", syncPreviewAudio);
videoMedia.addEventListener("ratechange", () => { previewAudio.playbackRate = videoMedia.playbackRate; });
videoMedia.addEventListener("volumechange", () => { previewAudio.volume = videoMedia.volume; previewAudio.muted = videoMedia.muted; });

function renderPhotoGallery(images) {
  images.forEach((url, index) => {
    const link = document.createElement("a");
    link.className = "photo-item"; link.href = url; link.title = "Download foto " + (index + 1);
    link.addEventListener("click", async event => {
      event.preventDefault();
      if (link.dataset.busy) return;
      link.dataset.busy = "1";
      try {
        const blob = await fetchBlob(url);
        saveBlob(blob, `${mediaBaseName()}-${index + 1}.${extFromType(blob.type, "jpg")}`);
        showToast("Foto berhasil diunduh ✓");
      } catch (error) { console.error(error); showToast("Gagal mengunduh foto."); }
      finally { delete link.dataset.busy; }
    });
    const image = document.createElement("img");
    image.src = url; image.alt = "Foto " + (index + 1); image.loading = "lazy";
    link.appendChild(image); photoGallery.appendChild(link);
  });
}

function configureMediaLink(element, url, label, ext, formatId = "", mode = "video") {
  element.hidden = !url;
  if (!url) { element.removeAttribute("href"); return; }
  if (usesBackend(currentMedia) && mode === "audio") {
    element.href = buildBackendUrl(currentMedia.url, "", "audio");
  } else if (usesBackend(currentMedia) && (formatId || url === currentMedia.video)) {
    element.href = buildBackendUrl(currentMedia.url, formatId);
  } else { element.href = url; }
  element.textContent = label;
  element.dataset.label = label;
  element.dataset.ext = ext || "mp4";
}

[downloadMedia, audioMedia].forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    const url = link.getAttribute("href");
    if (!url || url === "#") return;
    downloadFile(url, mediaBaseName(), link.dataset.ext, link, link.dataset.label);
  });
});

downloadAllPhotos.addEventListener("click", async () => {
  const images = currentMedia?.images || [];
  if (!images.length || downloadAllPhotos.dataset.busy) return;
  downloadAllPhotos.dataset.busy = "1";
  let completed = 0;
  try {
    for (let index = 0; index < images.length; index++) {
      downloadAllPhotos.textContent = `Foto ${index + 1}/${images.length}…`;
      try {
        const blob = await fetchBlob(images[index]);
        saveBlob(blob, `${mediaBaseName()}-${index + 1}.${extFromType(blob.type, "jpg")}`);
        completed++;
      } catch (error) { console.error(error); }
      await sleep(500);
    }
    showToast(`${completed} dari ${images.length} foto berhasil diunduh`);
  } finally {
    delete downloadAllPhotos.dataset.busy;
    downloadAllPhotos.textContent = "Download semua foto";
  }
});

function addHistory(media) {
  if (!settings.saveHistory) return;
  const existing = history.find(item => item.id === media.id);
  if (existing) {
    const favorite = existing.favorite;
    Object.assign(existing, media, { favorite });
  } else {
    history.unshift(media);
  }
  history = history.slice(0, 100);
  persistHistory(); renderHistory();
}

function makeButton(label, callback) {
  const button = document.createElement("button");
  button.type = "button"; button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const empty = document.getElementById("emptyHistory");
  if (!list) return;
  list.innerHTML = "";

  const search = document.getElementById("searchHistory").value.trim().toLowerCase();
  const filter = document.getElementById("filterHistory").value;
  const sort = document.getElementById("sortHistory").value;

  let items = history.filter(item => (item.title || "").toLowerCase().includes(search));
  if (filter === "favorite") items = items.filter(item => item.favorite);
  items.sort((a, b) => {
    const difference = new Date(b.date) - new Date(a.date);
    return sort === "oldest" ? -difference : difference;
  });

  visibleIds = items.map(item => item.id);
  if (empty) empty.hidden = items.length > 0;

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "history-card";
    if (selected.has(item.id)) card.classList.add("is-selected");

    const thumbDiv = document.createElement("div");
    thumbDiv.className = "history-thumb";
    if (item.cover) {
      const image = document.createElement("img");
      image.src = item.cover; image.alt = item.title || "Media"; image.loading = "lazy";
      thumbDiv.appendChild(image);
    } else {
      thumbDiv.textContent = "Tidak ada gambar";
    }

    if (selectMode) {
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "history-check";
      check.checked = selected.has(item.id);
      check.addEventListener("change", (e) => {
        if (e.target.checked) selected.add(item.id);
        else selected.delete(item.id);
        card.classList.toggle("is-selected", e.target.checked);
        updateSelectCount();
      });
      thumbDiv.appendChild(check);
    }

    const infoDiv = document.createElement("div");
    infoDiv.className = "history-info";

    const metaDiv = document.createElement("div");
    metaDiv.className = "history-meta";
    
    const platform = document.createElement("span");
    platform.className = "history-type";
    platform.textContent = platformNames[item.platform] || "Media";

    const dateSpan = document.createElement("span");
    dateSpan.className = "history-date";
    const dateObj = new Date(item.date);
    dateSpan.textContent = isNaN(dateObj) ? "" : dateObj.toLocaleDateString('id-ID', {day: 'numeric', month: 'short'});

    metaDiv.append(platform, dateSpan);

    const heading = document.createElement("h3");
    heading.textContent = item.title || "Media";

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "history-actions";

    const openButton = makeButton("Buka", () => {
      currentMedia = item;
      displayMedia(item);
      resultSection.scrollIntoView({ behavior: "smooth" });
    });
    openButton.className = "btn-open-action";

    const favoriteButton = makeButton(item.favorite ? "★ Favorit" : "☆ Favorit", () => {
      item.favorite = !item.favorite;
      persistHistory(); renderHistory(); updateFavoriteButton();
    });
    favoriteButton.className = "btn-fav-action";

    const deleteButton = makeButton("Hapus", () => {
      history = history.filter(entry => entry.id !== item.id);
      persistHistory(); renderHistory();
    });
    deleteButton.className = "btn-del-action";

    actionsDiv.append(openButton, favoriteButton, deleteButton);
    infoDiv.append(metaDiv, heading, actionsDiv);
    card.append(thumbDiv, infoDiv);
    
    list.appendChild(card);
  });
}

function updateFavoriteButton() {
  const button = document.getElementById("favoriteCurrent");
  if (button) {
    button.textContent = currentMedia?.favorite ? "★ Hapus favorit" : "☆ Favorit";
  }
}

document.getElementById("clearHistory").addEventListener("click", () => {
  if (!history.length) return;
  if (confirm("Hapus semua riwayat?")) {
    history = [];
    persistHistory();
    renderHistory();
  }
});

document.getElementById("favoriteCurrent").addEventListener("click", () => {
  if (!currentMedia || !settings.saveHistory) return;
  const item = history.find(entry => entry.id === currentMedia.id);
  if (!item) return;
  item.favorite = !item.favorite;
  currentMedia.favorite = item.favorite;
  persistHistory();
  renderHistory();
  updateFavoriteButton();
});

const pasteBtn = document.getElementById("pasteBtn");
if (pasteBtn) {
  pasteBtn.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        showStatus("Tautan ditempel dari clipboard.");
      }
    } catch (err) {
      showToast("Gagal akses clipboard. Tempel manual aja bro.");
    }
  });
}

window.addEventListener("focus", async () => {
  if (!settings.autoPaste || document.activeElement === urlInput || urlInput.value) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text && text !== lastClipboard && detectPlatform(text)) {
      lastClipboard = text;
      urlInput.value = text.trim();
      showStatus("Tautan terdeteksi otomatis dari clipboard.");
    }
  } catch (err) {}
});

document.getElementById("closeResult").addEventListener("click", () => {
  resultSection.hidden = true;
  videoMedia.pause();
  stopPreviewAudio();
});

document.getElementById("shareMedia").addEventListener("click", async () => {
  if (!currentMedia) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: currentMedia.title || 'Downly Media',
        url: currentMedia.url
      });
    } catch (err) {
      console.error("Share failed", err);
    }
  } else {
    showToast("Browser ini tidak mendukung fitur bagikan.");
  }
});

document.getElementById("copyMediaUrl").addEventListener("click", async () => {
  if (!currentMedia) return;
  try {
    await navigator.clipboard.writeText(currentMedia.url);
    showToast("Tautan disalin ✓");
  } catch (err) {
    showToast("Gagal menyalin tautan.");
  }
});

document.querySelectorAll(".accent-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const accent = btn.dataset.accent;
    if (ACCENTS.includes(accent)) {
      settings.accent = accent;
      storeSettings();
      applySettings();
      document.querySelectorAll(".accent-btn").forEach(b => b.setAttribute("aria-pressed", b === btn));
    }
  });
});

document.getElementById("resetSettings").addEventListener("click", () => {
  if (confirm("Reset semua pengaturan ke awal?")) {
    localStorage.removeItem(SETTINGS_KEY);
    settings = loadSettings();
    applySettings();
    showToast("Pengaturan direset.");
  }
});

const selectToggle = document.getElementById("selectToggle");
const selectAllBtn = document.getElementById("selectAllBtn");
const deleteSelected = document.getElementById("deleteSelected");

function updateSelectCount() {
  if (!deleteSelected) return;
  deleteSelected.textContent = `Hapus terpilih (${selected.size})`;
  deleteSelected.hidden = !selectMode || selected.size === 0;
  selectAllBtn.hidden = !selectMode || visibleIds.length === 0;
}

if (selectToggle) {
  selectToggle.addEventListener("click", () => {
    selectMode = !selectMode;
    selectToggle.setAttribute("aria-pressed", String(selectMode));
    selectToggle.textContent = selectMode ? "Batal" : "Pilih";
    selected.clear();
    renderHistory();
    updateSelectCount();
  });
}

if (selectAllBtn) {
  selectAllBtn.addEventListener("click", () => {
    const allSelected = visibleIds.every(id => selected.has(id));
    if (allSelected) {
      visibleIds.forEach(id => selected.delete(id));
    } else {
      visibleIds.forEach(id => selected.add(id));
    }
    renderHistory();
    updateSelectCount();
  });
}

if (deleteSelected) {
  deleteSelected.addEventListener("click", () => {
    if (selected.size === 0) return;
    if (confirm(`Hapus ${selected.size} media terpilih?`)) {
      history = history.filter(item => !selected.has(item.id));
      selected.clear();
      selectMode = false;
      if (selectToggle) {
        selectToggle.setAttribute("aria-pressed", "false");
        selectToggle.textContent = "Pilih";
      }
      persistHistory();
      renderHistory();
      updateSelectCount();
    }
  });
}

document.getElementById("exportHistory").addEventListener("click", () => {
  if (!history.length) return showToast("Riwayat kosong.");
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
  saveBlob(blob, `downly-riwayat-${new Date().toISOString().slice(0,10)}.json`);
});

const importFile = document.getElementById("importFile");
document.getElementById("importHistory").addEventListener("click", () => importFile.click());

importFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (Array.isArray(data)) {
        const combined = [...history];
        data.forEach(newItem => {
          if (!combined.some(oldItem => oldItem.id === newItem.id)) {
            combined.push(newItem);
          }
        });
        history = combined;
        persistHistory();
        renderHistory();
        showToast("Riwayat berhasil diimpor.");
      } else {
        showToast("Format file tidak valid.");
      }
    } catch (err) {
      showToast("Gagal membaca file JSON.");
    }
  };
  reader.readAsText(file);
  importFile.value = "";
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    deferredPrompt = null;
  });
}

const menuBtn = document.getElementById("menuBtn");
const navMenu = document.getElementById("navMenu");

if (menuBtn && navMenu) {
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = navMenu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  navMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", (e) => {
    if (navMenu.classList.contains("open") && !navMenu.contains(e.target) && e.target !== menuBtn) {
      navMenu.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });
}

function applySettings() {
  document.body.classList.toggle("dark-mode", settings.darkMode);
  document.body.dataset.accent = settings.accent;

  if (darkModeInput) darkModeInput.checked = settings.darkMode;
  if (autoPasteInput) autoPasteInput.checked = settings.autoPaste;
  if (saveHistoryInput) saveHistoryInput.checked = settings.saveHistory;
  
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-pressed", String(settings.darkMode));
    const label = document.getElementById("themeButtonLabel");
    if (label) label.textContent = settings.darkMode ? "Mode terang" : "Mode gelap";
  }

  document.querySelectorAll(".accent-btn").forEach(btn => {
    btn.setAttribute("aria-pressed", String(btn.dataset.accent === settings.accent));
  });
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    settings.darkMode = !settings.darkMode;
    storeSettings();
    applySettings();
  });
}

if (darkModeInput) {
  darkModeInput.addEventListener("change", event => {
    settings.darkMode = event.target.checked;
    storeSettings();
    applySettings();
  });
}

if (autoPasteInput) {
  autoPasteInput.addEventListener("change", event => {
    settings.autoPaste = event.target.checked;
    storeSettings();
  });
}

if (saveHistoryInput) {
  saveHistoryInput.addEventListener("change", event => {
    settings.saveHistory = event.target.checked;
    if (!settings.saveHistory) {
      history = [];
      try { localStorage.removeItem(HISTORY_KEY); } catch {}
    }
    storeSettings();
    renderHistory();
  });
}

applySettings();
renderHistory();
updateSelectCount();

const copyCaptionBtn = document.getElementById("copyCaption");
if (copyCaptionBtn) {
  copyCaptionBtn.addEventListener("click", async () => {
    if (!currentMedia || !currentMedia.title) return;
    try {
      await navigator.clipboard.writeText(currentMedia.title);
      showToast("Caption berhasil disalin ✓");
    } catch (err) {
      showToast("Gagal menyalin caption.");
    }
  });
}