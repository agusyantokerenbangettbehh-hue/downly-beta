import { pickQuality, applyTemplate } from "./extra.js";
import { BACKEND_BASE, BACKEND_INFO_TIMEOUT, BACKEND_IDLE_TIMEOUT, BACKEND_WAIT_TIMEOUT, platformNames } from "./config.js";
import { sleep, hashString, absoluteUrl, fetchJson, fetchWithTimeout, fetchBlob, saveBlob, extFromType, safeName, showToast, updateProgressBar } from "./utils.js";
import { state } from "./state.js";

export function buildBackendUrl(mediaUrl, formatId, mode = "video") { let link = `${BACKEND_BASE}/api/download?url=${encodeURIComponent(mediaUrl)}`; if (formatId) link += `&format_id=${encodeURIComponent(formatId)}`; if (mode === "audio") link += "&mode=audio"; return link; }
export function buildProxyUrl(mediaUrl) { return `${BACKEND_BASE}/api/proxy?url=${encodeURIComponent(mediaUrl)}`; }
export function usesBackend(media) { return Boolean(media) && (media.source === "backend" || media.platform !== "tiktok"); }
export function getQualities(media) { return (Array.isArray(media.qualities) && media.qualities.length) ? media.qualities : media.video ? [{ label: "Video", url: media.video }] : []; }

function filenameFromDisposition(header) { if (!header) return ""; const encoded = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/); if (encoded) { try { return decodeURIComponent(encoded[1].trim()); } catch {} } const plain = header.match(/filename\s*=\s*"?([^";]+)"?/); return plain ? plain[1].trim() : ""; }

export async function downloadFromBackend(fullUrl, { baseName, fallbackExt = "mp4", onProgress, onPhase } = {}) {
  const controller = new AbortController(); let timedOut = false;
  const arm = ms => setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  let timer = arm(BACKEND_WAIT_TIMEOUT); const started = Date.now();
  const ticker = onPhase ? setInterval(() => onPhase(Math.round((Date.now() - started) / 1000)), 1000) : null;
  if (onPhase) onPhase(0);
  let response;
  try { response = await fetch(fullUrl, { signal: controller.signal }); } catch { clearTimeout(timer); if (ticker) clearInterval(ticker); throw new Error(timedOut ? "Server terlalu lama." : "Server terputus."); }
  if (ticker) clearInterval(ticker);
  if (!response.ok) { clearTimeout(timer); let detail = ""; try { detail = (await response.json()).detail || ""; } catch {} throw new Error(detail || "Server error (HTTP " + response.status + ")"); }
  const total = Number(response.headers.get("content-length")) || 0; const contentType = response.headers.get("content-type") || ""; const serverName = filenameFromDisposition(response.headers.get("content-disposition")); const chunks = []; let loaded = 0;
  try {
    if (!response.body) { clearTimeout(timer); chunks.push(await response.blob()); }
    else { const reader = response.body.getReader(); for (;;) { clearTimeout(timer); timer = arm(BACKEND_IDLE_TIMEOUT); const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.length; if (onProgress) onProgress(total ? loaded / total : "loading"); } }
  } catch { throw new Error(timedOut ? "Koneksi timeout." : "Unduhan terputus."); } finally { clearTimeout(timer); }
  const blob = new Blob(chunks, { type: contentType }); if (!blob.size) throw new Error("File kosong."); if (total && loaded && loaded < total) throw new Error("File tidak lengkap."); const match = serverName.match(/\.([a-z0-9]{2,4})$/i); const extension = (match && match[1]) || extFromType(contentType, fallbackExt); saveBlob(blob, `${baseName || "downly"}.${extension}`);
}

export async function downloadMediaItem(media, onProgress, onPhase) {
  const base = safeName(applyTemplate(media)); const images = Array.isArray(media.images) ? media.images : [];
  if (images.length) { for (let i = 0; i < images.length; i++) { const blob = await fetchBlob(images[i]); saveBlob(blob, `${base}-${i + 1}.${extFromType(blob.type, "jpg")}`); onProgress((i + 1) / images.length); await sleep(400); } return; }
  const qualities = getQualities(media); const best = pickQuality(qualities);
  if (usesBackend(media)) { await downloadFromBackend(buildBackendUrl(media.url, best?.format_id), { baseName: base, fallbackExt: "mp4", onPhase, onProgress: progress => onProgress(progress ?? 0) }); return; }
  const target = best?.url || media.cover; if (!target) throw new Error("Media tidak ditemukan."); const blob = await fetchBlob(target, onProgress); saveBlob(blob, `${base}.${extFromType(blob.type, best ? "mp4" : "jpg")}`);
}

export async function downloadFile(url, baseName, fallbackExt, button, idleLabel) {
  if (button.dataset.busy) return; button.dataset.busy = "1"; button.classList.add("is-loading"); const originalLabel = idleLabel || button.textContent; button.textContent = "Menyiapkan download…";
  const container = document.getElementById("progressContainer"); const bar = document.getElementById("progressBar"); if (container) container.hidden = false; if (bar) { bar.style.width = "0%"; bar.style.opacity = "1"; }
  try {
    if (state.currentMedia && usesBackend(state.currentMedia) && url.startsWith(BACKEND_BASE)) {
      await downloadFromBackend(url, { baseName, fallbackExt, onProgress: (progress) => { if (progress === "loading") { button.textContent = "Mengunduh..."; updateProgressBar("loading"); } else if (progress !== null) { button.textContent = "Mengunduh " + Math.round(progress * 100) + "%"; updateProgressBar(progress); } }, onPhase: seconds => { button.textContent = "Memproses server… " + seconds + " d"; } });
    } else {
      const blob = await fetchBlob(url, progress => { if (progress === "loading") { button.textContent = "Mengunduh..."; updateProgressBar("loading"); } else if (progress !== null) { button.textContent = "Mengunduh " + Math.round(progress * 100) + "%"; updateProgressBar(progress); } }); saveBlob(blob, `${baseName || "downly"}.${extFromType(blob.type, fallbackExt)}`);
    }
    showToast("Download berhasil ✓");
  } catch (error) { console.error("Download error:", error); showToast(error.message || "Download gagal."); } finally { delete button.dataset.busy; button.classList.remove("is-loading"); button.textContent = originalLabel; updateProgressBar(null); }
}

async function requestTikwm(url, canRetry = true) { const response = await fetchJson("https://www.tikwm.com/api/?hd=1&url=" + encodeURIComponent(url)); if (response.code !== 0 || !response.data) { if (canRetry && /limit/i.test(response.msg || "")) { await sleep(1500); return requestTikwm(url, false); } throw new Error(response.msg || "Media tidak ditemukan."); } return response.data; }
async function getTikTokMedia(url) { const data = await requestTikwm(url); const qualities = [{ label: "HD", url: absoluteUrl(data.hdplay) }, { label: "Standar", url: absoluteUrl(data.play) }, { label: "Dengan watermark", url: absoluteUrl(data.wmplay) }].filter((item, index, array) => item.url && array.findIndex(other => other.url === item.url) === index); return { id: String(data.id || Date.now()), platform: "tiktok", username: data.author?.unique_id || "", url, title: data.title || "Media TikTok", cover: absoluteUrl(data.cover || data.origin_cover || ""), video: qualities[0]?.url || "", qualities, audio: absoluteUrl(data.music || ""), images: Array.isArray(data.images) ? data.images.filter(Boolean).map(absoluteUrl) : [], date: new Date().toISOString(), favorite: false }; }
async function getBackendMedia(url, platform) { const response = await fetchWithTimeout(`${BACKEND_BASE}/api/info?url=${encodeURIComponent(url)}`, BACKEND_INFO_TIMEOUT); if (!response.ok) throw new Error("Server error HTTP " + response.status); const data = await response.json(); if (!data.ok) throw new Error(data.error || "Gagal mengambil media."); const qualities = (data.qualities || []).map(item => ({ label: item.label, url: item.url, format_id: item.format_id, has_audio: Boolean(item.has_audio) })); const audioVideo = qualities.find(item => item.has_audio); return { id: platform + "-" + hashString(url), platform, source: "backend", username: data.uploader || data.username || "", url, title: data.title || "Media " + platformNames[platform], cover: data.cover || data.thumbnail || "", video: data.video || audioVideo?.url || "", qualities, audio: data.audio || "", images: data.images || [], date: new Date().toISOString(), favorite: false }; }
export async function resolveMedia(url, platform) { if (platform === "tiktok") { try { return await getTikTokMedia(url); } catch (error) { console.warn("TikWM gagal, mencoba backend:", error); return getBackendMedia(url, platform); } } return getBackendMedia(url, platform); }