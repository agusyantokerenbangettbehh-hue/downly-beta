import { HISTORY_KEY, SETTINGS_KEY, ACCENTS, platformNames } from "./config.js";
import { state, updateFavoriteButton } from "./state.js";
import { displayMedia } from "./ui.js";

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      darkMode: s?.darkMode ?? false,
      saveHistory: s?.saveHistory ?? true,
      autoPaste: s?.autoPaste ?? true,
      accent: ACCENTS.includes(s?.accent) ? s.accent : "mono",
      customAccent: s?.customAccent ?? null
    };
  } catch {
    return { darkMode: false, saveHistory: true, autoPaste: true, accent: "mono", customAccent: null };
  }
}

export function storeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {} }
export function loadHistory() { try { const s = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(s) ? s : []; } catch { return []; } }
export function persistHistory() { try { if (state.settings.saveHistory) { localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history)); } } catch {} }

export function addHistory(media) {
  if (!state.settings.saveHistory) return;
  const existing = state.history.find(item => item.id === media.id);
  if (existing) { const favorite = existing.favorite; Object.assign(existing, media, { favorite }); } else { state.history.unshift(media); }
  state.history = state.history.slice(0, 100); persistHistory(); renderHistory();
}

function makeButton(label, callback) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.addEventListener("click", callback); return button; }

export function renderHistory() {
  const list = document.getElementById("historyList"); const empty = document.getElementById("emptyHistory"); if (!list) return; list.innerHTML = "";
  const search = document.getElementById("searchHistory").value.trim().toLowerCase(); const filter = document.getElementById("filterHistory").value; const sort = document.getElementById("sortHistory").value;
  let items = state.history.filter(item => (item.title || "").toLowerCase().includes(search));
  if (filter === "favorite") items = items.filter(item => item.favorite);
  items.sort((a, b) => { const difference = new Date(b.date) - new Date(a.date); return sort === "oldest" ? -difference : difference; });
  state.visibleIds = items.map(item => item.id); if (empty) empty.hidden = items.length > 0;

  items.forEach(item => {
    const card = document.createElement("article"); card.className = "history-card"; if (state.selected.has(item.id)) card.classList.add("is-selected");
    const thumbDiv = document.createElement("div"); thumbDiv.className = "history-thumb";
    if (item.cover) { const image = document.createElement("img"); image.src = item.cover; image.alt = item.title || "Media"; image.loading = "lazy"; thumbDiv.appendChild(image); } else { thumbDiv.textContent = "Tidak ada gambar"; }
    if (state.selectMode) { const check = document.createElement("input"); check.type = "checkbox"; check.className = "history-check"; check.checked = state.selected.has(item.id); check.addEventListener("change", (e) => { if (e.target.checked) state.selected.add(item.id); else state.selected.delete(item.id); card.classList.toggle("is-selected", e.target.checked); updateSelectCount(); }); thumbDiv.appendChild(check); }

    const infoDiv = document.createElement("div"); infoDiv.className = "history-info";
    const metaDiv = document.createElement("div"); metaDiv.className = "history-meta";
    const platform = document.createElement("span"); platform.className = "history-type"; platform.textContent = platformNames[item.platform] || "Media";
    const dateSpan = document.createElement("span"); dateSpan.className = "history-date"; const dateObj = new Date(item.date); dateSpan.textContent = isNaN(dateObj.getTime()) ? "" : dateObj.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    metaDiv.append(platform, dateSpan);

    const heading = document.createElement("h3"); heading.textContent = item.title || "Media";
    const actionsDiv = document.createElement("div"); actionsDiv.className = "history-actions";

    const openButton = makeButton("Buka", () => { state.currentMedia = item; displayMedia(item); const resultSection = document.getElementById("hasil"); if (resultSection) resultSection.scrollIntoView({ behavior: "smooth" }); }); openButton.className = "btn-open-action";
    const favoriteButton = makeButton(item.favorite ? "★ Favorit" : "☆ Favorit", () => { item.favorite = !item.favorite; persistHistory(); renderHistory(); updateFavoriteButton(); }); favoriteButton.className = "btn-fav-action";
    const deleteButton = makeButton("Hapus", () => { state.history = state.history.filter(entry => entry.id !== item.id); persistHistory(); renderHistory(); }); deleteButton.className = "btn-del-action";

    actionsDiv.append(openButton, favoriteButton, deleteButton); infoDiv.append(metaDiv, heading, actionsDiv); card.append(thumbDiv, infoDiv); list.appendChild(card);
  });
}

export function updateSelectCount() {
  const deleteSelected = document.getElementById("deleteSelected"); const selectAllBtn = document.getElementById("selectAllBtn"); if (!deleteSelected || !selectAllBtn) return;
  deleteSelected.textContent = `Hapus terpilih (${state.selected.size})`; deleteSelected.hidden = !state.selectMode || state.selected.size === 0; selectAllBtn.hidden = !state.selectMode || state.visibleIds.length === 0;
}