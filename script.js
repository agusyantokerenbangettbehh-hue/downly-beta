const platformDomains = {
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"]
};

const platformNames = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook"
};

const HISTORY_KEY = "downly_history_v3";
const SETTINGS_KEY = "downly_settings_v3";

const form = document.getElementById("formdownload");
const urlInput = document.getElementById("url");
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
const themeToggleBtn = document.getElementById("themeToggleBtn");
const darkModeInput = document.getElementById("darkMode");
const saveHistoryInput = document.getElementById("saveHistory");

let currentMedia = null;
let settings = loadSettings();
let history = loadHistory();

/* ---------- Storage ---------- */
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return {
      darkMode: saved?.darkMode ?? false,
      saveHistory: saved?.saveHistory ?? true
    };
  } catch {
    return { darkMode: false, saveHistory: true };
  }
}

function storeSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Gagal menyimpan pengaturan:", error);
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistHistory() {
  try {
    if (settings.saveHistory) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  } catch (error) {
    console.error("Gagal menyimpan riwayat:", error);
  }
}

/* ---------- Helpers ---------- */
function showStatus(message) {
  statusDownload.textContent = message;
}

function detectPlatform(value) {
  try {
    const parsed = new URL(value);
    if (!["https:", "http:"].includes(parsed.protocol)) return null;

    const host = parsed.hostname.toLowerCase();

    for (const [platform, domains] of Object.entries(platformDomains)) {
      if (domains.some(domain => host === domain || host.endsWith("." + domain))) {
        return platform;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/* ---------- TikTok resolver ---------- */
async function getTikTokMedia(url) {
  const response = await fetch(
    "https://www.tikwm.com/api/?url=" + encodeURIComponent(url)
  );

  if (!response.ok) throw new Error("Server downloader tidak merespons.");

  const json = await response.json();

  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || "Media tidak ditemukan.");
  }

  const data = json.data;

  return {
    id: String(data.id || Date.now()),
    platform: "tiktok",
    url,
    title: data.title || "Media TikTok",
    cover: data.cover || data.origin_cover || "",
    video: data.hdplay || data.play || "",
    audio: data.music || "",
    images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
    date: new Date().toISOString(),
    favorite: false
  };
}

/* ---------- Submit ---------- */
form.addEventListener("submit", async event => {
  event.preventDefault();

  const url = urlInput.value.trim();
  const detected = detectPlatform(url);

  if (!detected) {
    showStatus("URL tidak valid. Masukkan tautan TikTok yang benar.");
    return;
  }

  if (detected !== "tiktok") {
    showStatus(platformNames[detected] + " belum didukung. Saat ini hanya TikTok.");
    return;
  }

  downloadBtn.disabled = true;
  downloadBtn.textContent = "Memproses…";
  showStatus("Mengambil media dari TikTok...");

  try {
    const media = await getTikTokMedia(url);

    currentMedia = media;
    displayMedia(media);
    addHistory(media);
    updateFavoriteButton();

    showStatus("Media berhasil diambil.");

    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    showStatus("Gagal mengambil media. Periksa tautan atau coba lagi nanti.");
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = "Ambil media";
  }
});

/* ---------- Render result ---------- */
function displayMedia(media) {
  resultSection.hidden = false;

  const images = Array.isArray(media.images) ? media.images : [];
  const hasImages = images.length > 0;
  const hasVideo = Boolean(media.video);

  title.textContent = media.title || "Media";
  caption.textContent = media.title || "";

  /* Reset semua elemen preview */
  videoMedia.pause();
  videoMedia.removeAttribute("src");
  videoMedia.removeAttribute("poster");
  videoMedia.hidden = true;

  thumbnail.hidden = true;
  thumbnail.removeAttribute("src");

  photoGallery.replaceChildren();
  photoGallery.hidden = true;
  photoGallery.removeAttribute("data-count");

  mediaBadge.hidden = true;

  /* Tentukan mode tampilan: foto ATAU video, tidak keduanya */
  if (hasImages) {
    resultCard.dataset.type = "photo";

    photoGallery.hidden = false;
    photoGallery.dataset.count = String(images.length >= 5 ? "many" : images.length);
    renderPhotoGallery(images);

    mediaBadge.textContent = images.length + " foto";
    mediaBadge.hidden = false;

    /* Slideshow: kalau ada video dari tikwm, sediakan link download */
    configureMediaLink(
      downloadMedia,
      hasVideo ? media.video : "",
      "Download slideshow"
    );
  } else if (hasVideo) {
    resultCard.dataset.type = "video";

    videoMedia.hidden = false;
    if (media.cover) videoMedia.poster = media.cover;
    videoMedia.src = media.video;
    videoMedia.load();

    mediaBadge.textContent = "Video";
    mediaBadge.hidden = false;

    configureMediaLink(downloadMedia, media.video, "Download video");
  } else if (media.cover) {
    resultCard.dataset.type = "image";

    thumbnail.hidden = false;
    thumbnail.src = media.cover;

    mediaBadge.textContent = "Gambar";
    mediaBadge.hidden = false;

    configureMediaLink(downloadMedia, media.cover, "Download gambar");
  } else {
    resultCard.dataset.type = "empty";
    downloadMedia.hidden = true;
  }

  configureMediaLink(audioMedia, media.audio, "Download audio");
  updateFavoriteButton();
}

function renderPhotoGallery(images) {
  images.forEach((imageUrl, index) => {
    const link = document.createElement("a");
    link.className = "photo-item";
    link.href = imageUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `Buka foto ${index + 1}`);

    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = `Foto ${index + 1}`;
    image.loading = "lazy";
    image.decoding = "async";

    link.appendChild(image);
    photoGallery.appendChild(link);
  });
}

function configureMediaLink(element, url, label) {
  element.hidden = !url;

  if (!url) {
    if (element.tagName === "A") element.removeAttribute("href");
    return;
  }

  if (element.tagName === "A") {
    element.href = url;
    element.target = "_blank";
    element.rel = "noopener noreferrer";
    element.textContent = label;
  }
}

/* ---------- History ---------- */
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
  persistHistory();
  renderHistory();
}

function makeButton(label, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", callback);
  return button;
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const empty = document.getElementById("emptyHistory");
  if (!list) return;

  list.replaceChildren();

  const query = document.getElementById("searchHistory").value.trim().toLowerCase();
  const filter = document.getElementById("filterHistory").value;
  const sort = document.getElementById("sortHistory").value;

  let items = history.filter(item =>
    (item.title || "").toLowerCase().includes(query)
  );

  if (filter === "favorite") items = items.filter(item => item.favorite);

  items.sort((a, b) => {
    const difference = new Date(b.date) - new Date(a.date);
    return sort === "oldest" ? -difference : difference;
  });

  empty.hidden = items.length > 0;

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "history-card";

    const imageContainer = document.createElement("div");
    imageContainer.className = "history-thumb";

    if (item.cover) {
      const image = document.createElement("img");
      image.src = item.cover;
      image.alt = "";
      image.loading = "lazy";
      imageContainer.appendChild(image);
    } else {
      imageContainer.textContent = platformNames[item.platform] || "Media";
    }

    const info = document.createElement("div");
    info.className = "history-info";

    const platform = document.createElement("span");
    platform.className = "history-type";
    platform.textContent = platformNames[item.platform] || "Media";

    const heading = document.createElement("h3");
    heading.textContent = item.title || "Media";

    const date = document.createElement("small");
    date.className = "history-date";
    date.textContent = new Date(item.date).toLocaleString("id-ID");

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const open = makeButton("Buka", () => {
      currentMedia = item;
      displayMedia(item);
      resultSection.scrollIntoView({ behavior: "smooth" });
    });

    const favorite = makeButton(
      item.favorite ? "★ Favorit" : "☆ Favorit",
      () => {
        item.favorite = !item.favorite;
        if (currentMedia?.id === item.id) {
          currentMedia.favorite = item.favorite;
          updateFavoriteButton();
        }
        persistHistory();
        renderHistory();
      }
    );

    const remove = makeButton("Hapus", () => {
      history = history.filter(entry => entry.id !== item.id);
      persistHistory();
      renderHistory();
    });

    actions.append(open, favorite, remove);
    info.append(platform, heading, date, actions);
    card.append(imageContainer, info);

    list.appendChild(card);
  });
}

["searchHistory", "filterHistory", "sortHistory"].forEach(id => {
  const element = document.getElementById(id);
  element.addEventListener(
    id === "searchHistory" ? "input" : "change",
    renderHistory
  );
});

document.getElementById("clearHistory").addEventListener("click", () => {
  if (!history.length) return;
  if (confirm("Hapus semua riwayat download?")) {
    history = [];
    persistHistory();
    renderHistory();
  }
});

/* ---------- Result actions ---------- */
document.getElementById("closeResult").addEventListener("click", () => {
  resultSection.hidden = true;
});

document.getElementById("favoriteCurrent").addEventListener("click", () => {
  if (!currentMedia) return;

  if (!settings.saveHistory) {
    showStatus("Aktifkan simpan riwayat untuk menggunakan favorit.");
    return;
  }

  const item = history.find(entry => entry.id === currentMedia.id);

  if (!item) {
    showStatus("Media belum tersimpan dalam riwayat.");
    return;
  }

  item.favorite = !item.favorite;
  currentMedia.favorite = item.favorite;

  persistHistory();
  renderHistory();
  updateFavoriteButton();
});

function updateFavoriteButton() {
  const button = document.getElementById("favoriteCurrent");
  if (button) {
    button.textContent = currentMedia?.favorite ? "★ Hapus favorit" : "☆ Favorit";
  }
}

document.getElementById("copyMediaUrl").addEventListener("click", async () => {
  if (!currentMedia) return;
  try {
    await navigator.clipboard.writeText(currentMedia.url);
    showStatus("Tautan berhasil disalin.");
  } catch {
    showStatus("Gagal menyalin tautan. Salin URL secara manual.");
  }
});

document.getElementById("pasteBtn").addEventListener("click", async () => {
  try {
    urlInput.value = await navigator.clipboard.readText();
    urlInput.focus();
  } catch {
    showStatus("Tempel tautan secara manual ke kolom URL.");
  }
});

/* ---------- Menu ---------- */
const menuBtn = document.getElementById("menuBtn");
const navMenu = document.getElementById("navMenu");

menuBtn.addEventListener("click", () => {
  const open = navMenu.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});

navMenu.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    navMenu.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  });
});

/* ---------- Settings ---------- */
function applySettings() {
  document.body.classList.toggle("dark-mode", settings.darkMode);

  darkModeInput.checked = settings.darkMode;
  saveHistoryInput.checked = settings.saveHistory;

  themeToggleBtn.setAttribute("aria-pressed", String(settings.darkMode));
  document.getElementById("themeButtonLabel").textContent =
    settings.darkMode ? "Mode terang" : "Mode gelap";

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = settings.darkMode ? "#0a0a0a" : "#ffffff";
  }
}

function toggleTheme() {
  settings.darkMode = !settings.darkMode;
  storeSettings();
  applySettings();
}

themeToggleBtn.addEventListener("click", toggleTheme);

darkModeInput.addEventListener("change", event => {
  settings.darkMode = event.target.checked;
  storeSettings();
  applySettings();
});

saveHistoryInput.addEventListener("change", event => {
  settings.saveHistory = event.target.checked;

  if (!settings.saveHistory) {
    history = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  } else {
    persistHistory();
  }

  storeSettings();
});

document.getElementById("resetSettings").addEventListener("click", () => {
  settings = { darkMode: false, saveHistory: true };
  history = [];
  localStorage.removeItem(HISTORY_KEY);
  storeSettings();
  applySettings();
  renderHistory();
});

/* ---------- Init ---------- */
applySettings();
renderHistory();