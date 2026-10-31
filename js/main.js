import { initExtra } from "./extra.js";
import { MAX_BATCH, ACCENTS } from "./config.js";
import { state } from "./state.js";
import { showStatus, showToast, sleep, saveBlob, fetchBlob, extFromType, mediaBaseName, normalizeMediaUrl, detectPlatform, extractUrls } from "./utils.js";
import { resolveMedia, downloadMediaItem, downloadFile } from "./api.js";
import { displayMedia, applySettings, closeResultPanel, updatePhotoSelection } from "./ui.js";
import { loadSettings, storeSettings, loadHistory, persistHistory, addHistory, renderHistory, updateSelectCount } from "./history.js";
import { updateFavoriteButton } from "./state.js";

state.settings = loadSettings(); state.history = loadHistory();

const form = document.getElementById("formdownload"); const urlInput = document.getElementById("url"); const urlBox = document.getElementById("urlBox"); const urlMulti = document.getElementById("urlMulti"); const urlLabel = document.getElementById("urlLabel"); const modeSingle = document.getElementById("modeSingle"); const modeBatch = document.getElementById("modeBatch"); const batchList = document.getElementById("batchList"); const downloadBtn = document.getElementById("downloadBtn"); const resultSection = document.getElementById("hasil"); const downloadMedia = document.getElementById("downloadMedia"); const audioMedia = document.getElementById("audioMedia"); const downloadAllPhotos = document.getElementById("downloadAllPhotos"); const themeToggleBtn = document.getElementById("themeToggleBtn"); const darkModeInput = document.getElementById("darkMode"); const autoPasteInput = document.getElementById("autoPaste"); const saveHistoryInput = document.getElementById("saveHistory"); const installBtn = document.getElementById("installApp"); const menuBtn = document.getElementById("menuBtn"); const navMenu = document.getElementById("navMenu");

function setMode(batch) {
  state.batchMode = batch; urlBox.hidden = batch; urlMulti.hidden = !batch; urlInput.required = !batch; batchList.hidden = true; batchList.innerHTML = "";
  modeSingle.setAttribute("aria-pressed", String(!batch)); modeBatch.setAttribute("aria-pressed", String(batch));
  urlLabel.htmlFor = batch ? "urlMulti" : "url"; urlLabel.textContent = batch ? "Tempel banyak tautan" : "Tempel tautan"; downloadBtn.textContent = batch ? "Download semua" : "Ambil media";
  showStatus(batch ? `Satu tautan per baris, maksimal ${MAX_BATCH}.` : "Masukkan tautan di atas.");
}
modeSingle.addEventListener("click", () => setMode(false)); modeBatch.addEventListener("click", () => setMode(true));

function setBusy(busy) { downloadBtn.disabled = busy; downloadBtn.textContent = busy ? "Memproses…" : state.batchMode ? "Download semua" : "Ambil media"; }

let batchCancel = false;
async function runBatch(urls) {
  batchList.innerHTML = ""; batchList.hidden = false; batchCancel = false;
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "batch-cancel"; cancel.textContent = "Batalkan antrean";
  cancel.addEventListener("click", () => { batchCancel = true; cancel.disabled = true; cancel.textContent = "Membatalkan…"; });
  batchList.before(cancel);
  const rows = urls.map(url => {
    const li = document.createElement("li"), link = document.createElement("span"), st = document.createElement("strong"), retry = document.createElement("button");
    link.className = "batch-url"; link.textContent = url; st.className = "batch-status"; st.textContent = "Menunggu";
    retry.type = "button"; retry.className = "batch-retry"; retry.textContent = "Coba lagi"; retry.hidden = true;
    li.append(link, st, retry); batchList.appendChild(li); return { url, st, retry, ok: false };
  });
  const run = async row => {
    row.retry.hidden = true;
    try {
      row.st.textContent = "Mengambil media…";
      const media = await resolveMedia(row.url, detectPlatform(row.url)); addHistory(media);
      await downloadMediaItem(media, p => { row.st.textContent = "Mengunduh " + Math.round(p * 100) + "%"; }, s => { row.st.textContent = "Memproses server… " + s + " d"; });
      row.st.textContent = "Selesai ✓"; row.ok = true;
    } catch (error) { console.error("Batch download gagal:", error); row.st.textContent = "Gagal: " + (error.message || "Error"); row.retry.hidden = false; }
  };
  rows.forEach(r => r.retry.addEventListener("click", async () => { if (downloadBtn.disabled) return; await run(r); const n = rows.filter(x => x.ok).length; showStatus(`Selesai: ${n} berhasil, ${rows.length - n} gagal.`); }));
  try {
    for (let i = 0; i < rows.length; i++) {
      if (batchCancel) { rows[i].st.textContent = "Dibatalkan"; rows[i].retry.hidden = false; continue; }
      await run(rows[i]);
      if (i < rows.length - 1 && !batchCancel) await sleep(1200);
    }
  } finally { cancel.remove(); }
  const n = rows.filter(x => x.ok).length;
  showToast(`${n} dari ${rows.length} tautan selesai`); showStatus(`Selesai: ${n} berhasil, ${rows.length - n} gagal.`);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (state.batchMode) {
    const urls = [...new Set(extractUrls(urlMulti.value).map(normalizeMediaUrl).filter(Boolean).filter(detectPlatform))].slice(0, MAX_BATCH);
    if (!urls.length) { showStatus("Tidak ada tautan yang didukung."); return; }
    setBusy(true); showStatus(`Memproses ${urls.length} tautan…`);
    try { await runBatch(urls); } finally { setBusy(false); } return;
  }
  const url = normalizeMediaUrl(urlInput.value); const platform = detectPlatform(url);
  if (!platform) { showStatus("URL tidak valid."); return; }
  setBusy(true); showStatus("Mengambil media dari platform…");
  try {
    const media = await resolveMedia(url, platform); state.currentMedia = media; if (state.history.some(h => h.id === media.id)) showToast("Media ini sudah pernah kamu ambil sebelumnya"); displayMedia(media); addHistory(media); updateFavoriteButton(); showStatus("Media berhasil diambil."); resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) { console.error("Resolver error:", error); showStatus(error.message || "Gagal mengambil media. Coba lagi nanti."); }
  finally { setBusy(false); }
});

[downloadMedia, audioMedia].forEach(link => { link.addEventListener("click", event => { event.preventDefault(); const url = link.getAttribute("href"); if (!url || url === "#") return; downloadFile(url, mediaBaseName(), link.dataset.ext, link, link.dataset.label); }); });

downloadAllPhotos.addEventListener("click", async () => {
  const images = state.currentMedia?.images || [];
  if (!images.length || downloadAllPhotos.dataset.busy) return;
  const indexes = state.selectedPhotos.size ? [...state.selectedPhotos].sort((a, b) => a - b) : images.map((_, i) => i);
  downloadAllPhotos.dataset.busy = "1"; let completed = 0;
  try {
    for (let n = 0; n < indexes.length; n++) {
      const index = indexes[n]; downloadAllPhotos.textContent = `Foto ${n + 1}/${indexes.length}…`;
      try { const blob = await fetchBlob(images[index]); saveBlob(blob, `${mediaBaseName()}-${index + 1}.${extFromType(blob.type, "jpg")}`); completed++; } catch (error) { console.error(error); }
      await sleep(500);
    }
    showToast(`${completed} dari ${indexes.length} foto berhasil diunduh`);
  } finally { delete downloadAllPhotos.dataset.busy; updatePhotoSelection(); }
});

const pasteBtn = document.getElementById("pasteBtn");
if (pasteBtn) { pasteBtn.addEventListener("click", async () => { try { const text = await navigator.clipboard.readText(); if (text) { urlInput.value = text.trim(); showStatus("Tautan ditempel dari clipboard."); } } catch { showToast("Gagal akses clipboard. Tempel manual aja bro."); } }); }

window.addEventListener("focus", async () => {
  if (!state.settings.autoPaste || document.activeElement === urlInput || urlInput.value) return;
  try { const text = await navigator.clipboard.readText(); if (text && text !== state.lastClipboard && detectPlatform(text)) { state.lastClipboard = text; urlInput.value = text.trim(); showStatus("Tautan terdeteksi otomatis dari clipboard."); } } catch {}
});

document.getElementById("closeResult").addEventListener("click", closeResultPanel);
document.getElementById("shareMedia").addEventListener("click", async () => { if (!state.currentMedia) return; if (navigator.share) { try { await navigator.share({ title: state.currentMedia.title || "Downly Media", url: state.currentMedia.url }); } catch (err) { console.error("Share failed", err); } } else { showToast("Browser ini tidak mendukung fitur bagikan."); } });
document.getElementById("copyMediaUrl").addEventListener("click", async () => { if (!state.currentMedia) return; try { await navigator.clipboard.writeText(state.currentMedia.url); showToast("Tautan disalin ✓"); } catch { showToast("Gagal menyalin tautan."); } });

const copyCaptionBtn = document.getElementById("copyCaption");
if (copyCaptionBtn) { copyCaptionBtn.addEventListener("click", async () => { if (!state.currentMedia || !state.currentMedia.title) return; try { await navigator.clipboard.writeText(state.currentMedia.title); showToast("Caption berhasil disalin ✓"); } catch { showToast("Gagal menyalin caption."); } }); }

document.querySelectorAll(".accent-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const accent = btn.dataset.accent;
    if (ACCENTS.includes(accent)) { state.settings.accent = accent; state.settings.customAccent = null; storeSettings(); applySettings(); }
  });
});

const customAccentInput = document.getElementById("customAccent");
if (customAccentInput) { customAccentInput.addEventListener("input", (e) => { state.settings.customAccent = e.target.value; storeSettings(); applySettings(); }); }

document.getElementById("resetSettings").addEventListener("click", () => {
  if (confirm("Reset semua pengaturan ke awal?")) { localStorage.removeItem("downly_settings_v3"); state.settings = loadSettings(); applySettings(); showToast("Pengaturan direset."); }
});

const selectToggle = document.getElementById("selectToggle"); const selectAllBtn = document.getElementById("selectAllBtn"); const deleteSelected = document.getElementById("deleteSelected");

if (selectToggle) { selectToggle.addEventListener("click", () => { state.selectMode = !state.selectMode; selectToggle.setAttribute("aria-pressed", String(state.selectMode)); selectToggle.textContent = state.selectMode ? "Batal" : "Pilih"; state.selected.clear(); renderHistory(); updateSelectCount(); }); }
if (selectAllBtn) { selectAllBtn.addEventListener("click", () => { const allSelected = state.visibleIds.every(id => state.selected.has(id)); if (allSelected) { state.visibleIds.forEach(id => state.selected.delete(id)); } else { state.visibleIds.forEach(id => state.selected.add(id)); } renderHistory(); updateSelectCount(); }); }
if (deleteSelected) { deleteSelected.addEventListener("click", () => { if (state.selected.size === 0) return; if (confirm(`Hapus ${state.selected.size} media terpilih?`)) { state.history = state.history.filter(item => !state.selected.has(item.id)); state.selected.clear(); state.selectMode = false; if (selectToggle) { selectToggle.setAttribute("aria-pressed", "false"); selectToggle.textContent = "Pilih"; } persistHistory(); renderHistory(); updateSelectCount(); } }); }

document.getElementById("exportHistory").addEventListener("click", () => { if (!state.history.length) return showToast("Riwayat kosong."); const blob = new Blob([JSON.stringify(state.history, null, 2)], { type: "application/json" }); saveBlob(blob, `downly-riwayat-${new Date().toISOString().slice(0, 10)}.json`); });

const importFile = document.getElementById("importFile"); document.getElementById("importHistory").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => { try { const data = JSON.parse(event.target.result); if (Array.isArray(data)) { const combined = [...state.history]; data.forEach(newItem => { if (!combined.some(oldItem => oldItem.id === newItem.id)) { combined.push(newItem); } }); state.history = combined; persistHistory(); renderHistory(); showToast("Riwayat berhasil diimpor."); } else { showToast("Format file tidak valid."); } } catch { showToast("Gagal membaca file JSON."); } };
  reader.readAsText(file); importFile.value = "";
});

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.deferredPrompt = e; if (installBtn) installBtn.hidden = false; });
if (installBtn) { installBtn.addEventListener("click", async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); const { outcome } = await state.deferredPrompt.userChoice; if (outcome === "accepted") installBtn.hidden = true; state.deferredPrompt = null; }); }

if (menuBtn && navMenu) {
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); const isOpen = navMenu.classList.toggle("open"); menuBtn.setAttribute("aria-expanded", String(isOpen)); });
  navMenu.querySelectorAll("a").forEach(link => { link.addEventListener("click", () => { navMenu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }); });
  document.addEventListener("click", (e) => { if (navMenu.classList.contains("open") && !navMenu.contains(e.target) && e.target !== menuBtn) { navMenu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });
}

document.getElementById("clearHistory").addEventListener("click", () => { if (!state.history.length) return; if (confirm("Hapus semua riwayat?")) { state.history = []; persistHistory(); renderHistory(); } });

document.getElementById("favoriteCurrent").addEventListener("click", () => {
  if (!state.currentMedia || !state.settings.saveHistory) return; const item = state.history.find(entry => entry.id === state.currentMedia.id); if (!item) return;
  item.favorite = !item.favorite; state.currentMedia.favorite = item.favorite; persistHistory(); renderHistory(); updateFavoriteButton();
});

if (themeToggleBtn) { themeToggleBtn.addEventListener("click", () => { state.settings.darkMode = !state.settings.darkMode; storeSettings(); applySettings(); }); }
if (darkModeInput) { darkModeInput.addEventListener("change", event => { state.settings.darkMode = event.target.checked; storeSettings(); applySettings(); }); }
if (autoPasteInput) { autoPasteInput.addEventListener("change", event => { state.settings.autoPaste = event.target.checked; storeSettings(); }); }

if (saveHistoryInput) {
  saveHistoryInput.addEventListener("change", event => {
    state.settings.saveHistory = event.target.checked;
    if (!state.settings.saveHistory) { state.history = []; try { localStorage.removeItem("downly_history_v3"); } catch {} }
    storeSettings(); renderHistory();
  });
}

applySettings();
renderHistory();
updateSelectCount();

if (copyCaptionBtn) {
  const thumbBtn = document.createElement("button"); thumbBtn.type = "button"; thumbBtn.className = copyCaptionBtn.className; thumbBtn.textContent = "Unduh thumbnail"; copyCaptionBtn.after(thumbBtn);
  thumbBtn.addEventListener("click", async () => {
    const cover = state.currentMedia?.cover; if (!cover) return showToast("Thumbnail tidak tersedia.");
    try { const blob = await fetchBlob(cover); saveBlob(blob, `${mediaBaseName()}-thumb.${extFromType(blob.type, "jpg")}`); showToast("Thumbnail diunduh ✓"); } catch { showToast("Gagal mengunduh thumbnail."); }
  });
}
initExtra();
