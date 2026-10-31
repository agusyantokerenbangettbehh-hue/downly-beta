import { pickQuality, applyTemplate } from "./extra.js";
import { getQualities, usesBackend, buildProxyUrl, buildBackendUrl } from "./api.js";
import { state } from "./state.js";

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
const previewAudio = new Audio();
previewAudio.preload = "auto";
let syncAudio = false;

function stopPreviewAudio() { syncAudio = false; previewAudio.pause(); previewAudio.removeAttribute("src"); previewAudio.load(); }
function syncPreviewAudio() { if (!syncAudio) return; if (Math.abs(previewAudio.currentTime - videoMedia.currentTime) > 0.3) { previewAudio.currentTime = videoMedia.currentTime; } }
function startPreview(media, quality) { stopPreviewAudio(); const raw = quality?.url || media.video || ""; if (!raw) return false; videoMedia.muted = false; videoMedia.volume = 1; if (!usesBackend(media)) { videoMedia.src = raw; videoMedia.load(); return true; } videoMedia.src = buildProxyUrl(raw); videoMedia.load(); if (quality && quality.has_audio === false && media.audio) { syncAudio = true; previewAudio.src = buildProxyUrl(media.audio); previewAudio.load(); } return true; }

videoMedia.addEventListener("play", () => { if (!syncAudio) return; previewAudio.currentTime = videoMedia.currentTime; previewAudio.play().catch(() => {}); });
videoMedia.addEventListener("playing", () => { if (!syncAudio) return; syncPreviewAudio(); previewAudio.play().catch(() => {}); });
["pause", "waiting", "ended"].forEach(name => { videoMedia.addEventListener(name, () => { if (syncAudio) previewAudio.pause(); }); });
videoMedia.addEventListener("seeked", syncPreviewAudio);
videoMedia.addEventListener("timeupdate", syncPreviewAudio);
videoMedia.addEventListener("ratechange", () => { previewAudio.playbackRate = videoMedia.playbackRate; });
videoMedia.addEventListener("volumechange", () => { previewAudio.volume = videoMedia.volume; previewAudio.muted = videoMedia.muted; });

export function closeResultPanel() { if (resultSection) resultSection.hidden = true; videoMedia.pause(); stopPreviewAudio(); }

function getContrastColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.5 ? "#0a0a0a" : "#ffffff";
}

function getAccentPreviewColor() {
  if (state.settings.customAccent) return state.settings.customAccent;
  const dark = state.settings.darkMode;
  const map = { mono: dark ? "#fafafa" : "#0a0a0a", biru: dark ? "#60a5fa" : "#2563eb", hijau: dark ? "#4ade80" : "#16a34a", merah: dark ? "#f87171" : "#dc2626", ungu: dark ? "#a78bfa" : "#7c3aed", oranye: dark ? "#fb923c" : "#ea580c", pink: dark ? "#f472b6" : "#db2777" };
  return map[state.settings.accent] || map.mono;
}

function applyCustomAccent(hex) { document.body.style.setProperty("--accent", hex); document.body.style.setProperty("--accent-text", getContrastColor(hex)); }
function clearCustomAccent() { document.body.style.removeProperty("--accent"); document.body.style.removeProperty("--accent-text"); }

export function applySettings() {
  if (!state.settings) return;
  document.body.classList.toggle("dark-mode", state.settings.darkMode);
  document.body.dataset.accent = state.settings.accent;

  if (state.settings.customAccent) { applyCustomAccent(state.settings.customAccent); } else { clearCustomAccent(); }

  const darkModeInput = document.getElementById("darkMode");
  const autoPasteInput = document.getElementById("autoPaste");
  const saveHistoryInput = document.getElementById("saveHistory");
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  const customAccentInput = document.getElementById("customAccent");

  if (darkModeInput) darkModeInput.checked = state.settings.darkMode;
  if (autoPasteInput) autoPasteInput.checked = state.settings.autoPaste;
  if (saveHistoryInput) saveHistoryInput.checked = state.settings.saveHistory;

  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-pressed", String(state.settings.darkMode));
    const label = document.getElementById("themeButtonLabel");
    if (label) label.textContent = state.settings.darkMode ? "Mode terang" : "Mode gelap";
  }

  if (customAccentInput) customAccentInput.value = getAccentPreviewColor();

  document.querySelectorAll(".accent-btn").forEach(btn => {
    const isActive = !state.settings.customAccent && btn.dataset.accent === state.settings.accent;
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

let selectAllBtn;
function ensureSelectAllBtn() {
  if (selectAllBtn) return selectAllBtn;
  selectAllBtn = document.createElement("button");
  selectAllBtn.type = "button"; selectAllBtn.className = downloadAllPhotos.className; selectAllBtn.hidden = true;
  photoGallery.after(selectAllBtn);
  selectAllBtn.addEventListener("click", () => {
    const items = [...photoGallery.querySelectorAll(".photo-item")];
    const all = state.selectedPhotos.size === items.length;
    items.forEach((_, i) => setPhotoSelected(i, !all));
    updatePhotoSelection();
  });
  return selectAllBtn;
}

function setPhotoSelected(index, on) {
  const item = photoGallery.querySelectorAll(".photo-item")[index];
  if (!item) return;
  on ? state.selectedPhotos.add(index) : state.selectedPhotos.delete(index);
  item.classList.toggle("selected", on);
  item.setAttribute("aria-pressed", String(on));
  item.querySelector(".photo-check").textContent = on ? "✓" : "";
}

export function updatePhotoSelection() {
  const total = state.currentMedia?.images?.length || 0;
  const count = state.selectedPhotos.size;
  downloadAllPhotos.textContent = count ? `Download terpilih (${count})` : "Download semua foto";
  ensureSelectAllBtn().textContent = count === total ? "Batal pilih semua" : "Pilih semua";
}

function renderPhotoGallery(images) {
  state.selectedPhotos = new Set();
  images.forEach((url, index) => {
    const link = document.createElement("a");
    link.className = "photo-item"; link.href = url; link.title = "Pilih foto " + (index + 1);
    link.setAttribute("aria-pressed", "false"); link.style.setProperty("--i", index);
    const image = document.createElement("img");
    image.src = url; image.alt = "Foto " + (index + 1); image.loading = "lazy";
    const mark = document.createElement("span"); mark.className = "photo-check";
    link.append(image, mark);
    link.addEventListener("click", event => { event.preventDefault(); setPhotoSelected(index, !state.selectedPhotos.has(index)); updatePhotoSelection(); });
    photoGallery.appendChild(link);
  });
  updatePhotoSelection();
}

function configureMediaLink(element, url, label, ext, formatId = "", mode = "video") {
  element.hidden = !url; if (!url) { element.removeAttribute("href"); return; }
  if (usesBackend(state.currentMedia) && mode === "audio") { element.href = buildBackendUrl(state.currentMedia.url, "", "audio"); }
  else if (usesBackend(state.currentMedia) && (formatId || url === state.currentMedia.video)) { element.href = buildBackendUrl(state.currentMedia.url, formatId); }
  else { element.href = url; }
  element.textContent = label; element.dataset.label = label; element.dataset.ext = ext || "mp4";
}

export function displayMedia(media) {
  resultSection.hidden = false; const images = media.images || []; const qualities = getQualities(media); const downloadUrl = media.video || qualities[0]?.url || ""; const playableUrl = media.video || qualities.find(q => q.has_audio)?.url || qualities[0]?.url || ""; const mainFormatId = qualities[0]?.format_id || ""; const hasImages = images.length > 0; const hasVideo = Boolean(downloadUrl || qualities.length);
  title.textContent = media.title || "Media"; caption.textContent = media.title || "";
  videoMedia.pause(); stopPreviewAudio(); videoMedia.removeAttribute("src"); videoMedia.removeAttribute("poster"); videoMedia.onerror = null; videoMedia.hidden = true; thumbnail.hidden = true; thumbnail.removeAttribute("src"); photoGallery.innerHTML = ""; photoGallery.hidden = true; qualitySelect.innerHTML = ""; qualitySelect.hidden = true; downloadAllPhotos.hidden = true; mediaBadge.hidden = true;

  if (hasImages) { resultCard.dataset.type = "photo"; photoGallery.hidden = false; renderPhotoGallery(images); mediaBadge.textContent = images.length + " foto"; mediaBadge.hidden = false; configureMediaLink(downloadMedia, downloadUrl, "Download video", "mp4", mainFormatId); }
  else if (hasVideo) { resultCard.dataset.type = "video"; const previewQuality = qualities.find(q => q.has_audio) || qualities.find(q => q.url === playableUrl) || qualities[0] || { url: playableUrl }; if (playableUrl || previewQuality.url) { videoMedia.hidden = false; if (media.cover) videoMedia.poster = media.cover; videoMedia.preload = "metadata"; startPreview(media, previewQuality); videoMedia.onerror = () => { videoMedia.pause(); stopPreviewAudio(); videoMedia.hidden = true; videoMedia.removeAttribute("src"); if (media.cover) { thumbnail.hidden = false; thumbnail.src = media.cover; } }; } else if (media.cover) { thumbnail.hidden = false; thumbnail.src = media.cover; } mediaBadge.textContent = "Video"; mediaBadge.hidden = false; configureMediaLink(downloadMedia, downloadUrl, "Download video", "mp4", mainFormatId); }
  else if (media.cover) { resultCard.dataset.type = "image"; thumbnail.hidden = false; thumbnail.src = media.cover; mediaBadge.textContent = "Gambar"; mediaBadge.hidden = false; configureMediaLink(downloadMedia, media.cover, "Download gambar", "jpg"); }
  else { resultCard.dataset.type = "empty"; downloadMedia.hidden = true; }

  if (hasVideo && qualities.length > 1) { qualities.forEach((quality, index) => { const option = document.createElement("option"); option.value = String(index); option.textContent = quality.label; qualitySelect.appendChild(option); }); const pi = Math.max(0, qualities.indexOf(pickQuality(qualities))); qualitySelect.value = String(pi); if (pi > 0) setTimeout(() => qualitySelect.dispatchEvent(new Event("change")), 0); qualitySelect.hidden = false; }
  configureMediaLink(audioMedia, usesBackend(media) ? media.url : media.audio, "Download audio", "mp3", "", "audio");
  downloadAllPhotos.hidden = !hasImages; ensureSelectAllBtn().hidden = !hasImages || images.length < 2;

  const customFilename = document.getElementById("customFilename");
  const copyCaption = document.getElementById("copyCaption");
  if (customFilename) { customFilename.hidden = false; customFilename.value = applyTemplate(media); }
  if (copyCaption) copyCaption.hidden = false;
}

qualitySelect.addEventListener("change", () => {
  if (!state.currentMedia) return; const quality = getQualities(state.currentMedia)[Number(qualitySelect.value)];
  if (quality) { configureMediaLink(downloadMedia, quality.url, "Download video", "mp4", quality.format_id); if (!state.currentMedia.images?.length && quality.url) { startPreview(state.currentMedia, quality); } }
});