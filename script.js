const form = document.getElementById("formdownload");
const inputUrl = document.getElementById("url");
const tombol = document.getElementById("downloadBtn");
const statusEl = document.getElementById("statusDownload");
const hasil = document.getElementById("hasil");
const thumbnail = document.getElementById("thumbnailMedia");
const judul = document.getElementById("judulMedia");
const daftarMedia = document.getElementById("daftarMedia");
const video = document.getElementById("videoMedia");
const progressBox = document.getElementById("progressBox");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

const menuBtn = document.getElementById("menuBtn");
const navMenu = document.getElementById("navMenu");

const darkMode = document.getElementById("darkMode");
const autoPreview = document.getElementById("autoPreview");
const resetSettings = document.getElementById("resetSettings");

const API = "https://www.tikwm.com/api/";
const BASE = "https://www.tikwm.com";
const COOLDOWN = 30;
const TIMEOUT = 20000;

let sedangProses = false;
let cooldown = false;
let timerCooldown = null;

function setStatus(teks) {
  if (statusEl) statusEl.textContent = teks;
}

function setProgress(nilai) {
  if (progressBar) progressBar.value = nilai;
  if (progressText) progressText.textContent = nilai + "%";
}

/* MENU */

function tutupMenu() {
  navMenu?.classList.remove("active");
  menuBtn?.setAttribute("aria-expanded", "false");
}

menuBtn?.addEventListener("click", event => {
  event.stopPropagation();

  const terbuka = navMenu?.classList.toggle("active");

  menuBtn?.setAttribute("aria-expanded", String(!!terbuka));
});

document.addEventListener("click", event => {
  if (!navMenu?.classList.contains("active")) return;

  const target = event.target;

  if (
    target instanceof Node &&
    !navMenu.contains(target) &&
    !menuBtn?.contains(target)
  ) {
    tutupMenu();
  }
});

navMenu?.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", tutupMenu);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    tutupMenu();
  }
});

/* URL MEDIA */

function normalisasiUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }

  url = url.trim();

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//")) {
    return "https:" + url;
  }

  if (url.startsWith("/")) {
    return BASE + url;
  }

  return null;
}

function bersihkanHasil() {
  if (hasil) hasil.hidden = true;

  if (daftarMedia) {
    daftarMedia.replaceChildren();
  }

  if (judul) {
    judul.textContent = "";
  }

  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");
    video.load();
    video.hidden = true;
  }

  if (thumbnail) {
    thumbnail.removeAttribute("src");
    thumbnail.hidden = true;
  }

  setProgress(0);
}

/* DOWNLOAD TANPA PINDAH TAB */

async function ambilFile(url) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("File kosong.");
    }

    if (
      /text\/html|application\/json/i.test(blob.type)
    ) {
      throw new Error("Server tidak mengirim file media.");
    }

    return blob;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Download terlalu lama.");
    }

    if (
      error instanceof TypeError ||
      /failed to fetch/i.test(error.message)
    ) {
      throw new Error(
        "Server memblokir akses browser (CORS)."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function ekstensiFile(blob, tipe) {
  const mime = blob.type || "";

  if (/video\/mp4/i.test(mime)) return "mp4";
  if (/audio\/mpeg/i.test(mime)) return "mp3";
  if (/audio\/mp4/i.test(mime)) return "m4a";
  if (/image\/jpeg/i.test(mime)) return "jpg";
  if (/image\/png/i.test(mime)) return "png";
  if (/image\/webp/i.test(mime)) return "webp";

  return tipe === "audio" ? "mp3" : "mp4";
}

function simpanBlob(blob, namaFile) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = blobUrl;
  link.download = namaFile;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 15000);
}

function buatTombol(teks, url, namaDasar, tipe) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = teks;
  button.className = "tombol-download";

  button.addEventListener("click", async () => {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Mengunduh...";

    try {
      const blob = await ambilFile(url);
      const ekstensi = ekstensiFile(blob, tipe);

      simpanBlob(
        blob,
        `${namaDasar}.${ekstensi}`
      );

      setStatus("File berhasil disiapkan untuk diunduh.");
    } catch (error) {
      console.error("Download error:", error);
      setStatus("Gagal mengunduh: " + error.message);
    } finally {
      button.disabled = false;
      button.textContent = teks;
    }
  });

  daftarMedia?.appendChild(button);
}

/* API TIKTOK */

async function ambilDataTikTok(url) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT
  );

  try {
    const body = new URLSearchParams({
      url: url,
      hd: "1"
    });

    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      signal: controller.signal
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          "API sedang sibuk. Coba lagi nanti."
        );
      }

      throw new Error(
        "Server API error: HTTP " + response.status
      );
    }

    const json = await response.json();

    if (json.code !== 0 || !json.data) {
      throw new Error(
        json.msg || "Video TikTok tidak ditemukan."
      );
    }

    return json.data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Server terlalu lama merespons."
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Tidak bisa menghubungi API. Periksa koneksi atau CORS."
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* TAMPILKAN HASIL */

function tampilkanHasil(data) {
  const urlVideo =
    normalisasiUrl(data.hdplay) ||
    normalisasiUrl(data.play);

  const urlAudio = normalisasiUrl(data.music);

  const urlThumbnail =
    normalisasiUrl(data.origin_cover) ||
    normalisasiUrl(data.cover);

  if (!urlVideo && !urlAudio) {
    throw new Error(
      "Link media tidak ditemukan dari API."
    );
  }

  if (judul) {
    judul.textContent =
      data.title || "Video TikTok";
  }

  if (video && urlVideo) {
    video.controls = true;
    video.playsInline = true;
    video.hidden = false;
    video.src = urlVideo;

    if (urlThumbnail) {
      video.poster = urlThumbnail;
    }

    video.load();

    const otomatis =
      localStorage.getItem("downlyAutoPreview") === "true";

    if (otomatis) {
      video.play().catch(() => {
        setStatus(
          "Preview siap. Tekan tombol play untuk memutar."
        );
      });
    }
  } else if (thumbnail && urlThumbnail) {
    thumbnail.src = urlThumbnail;
    thumbnail.hidden = false;
  }

  if (urlVideo) {
    buatTombol(
      "Unduh Video",
      urlVideo,
      "downly-tiktok",
      "video"
    );
  }

  if (urlAudio) {
    buatTombol(
      "Unduh Audio",
      urlAudio,
      "downly-tiktok-audio",
      "audio"
    );
  }

  if (hasil) {
    hasil.hidden = false;
  }

  setStatus("Video berhasil ditemukan!");
}

/* COOLDOWN 30 DETIK */

function mulaiCooldown() {
  clearInterval(timerCooldown);

  cooldown = true;

  let sisa = COOLDOWN;

  if (tombol) {
    tombol.disabled = true;
  }

  function updateTombol() {
    const menit = Math.floor(sisa / 60);
    const detik = sisa % 60;

    if (tombol) {
      tombol.textContent =
        `Tunggu ${menit}:${String(detik).padStart(2, "0")}`;
    }
  }

  updateTombol();

  timerCooldown = setInterval(() => {
    sisa--;

    if (sisa <= 0) {
      clearInterval(timerCooldown);
      timerCooldown = null;
      cooldown = false;

      if (tombol) {
        tombol.disabled = false;
        tombol.textContent = "Download";
      }

      setStatus(
        "Siap untuk download berikutnya."
      );

      return;
    }

    updateTombol();
  }, 1000);
}

/* PROSES DOWNLOAD */

form?.addEventListener("submit", async event => {
  event.preventDefault();

  if (sedangProses || cooldown) return;

  let url = inputUrl?.value.trim() || "";

  if (!url) {
    setStatus(
      "Masukkan URL TikTok terlebih dahulu."
    );
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  let host;

  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    setStatus("URL tidak valid.");
    return;
  }

  if (
    host !== "tiktok.com" &&
    !host.endsWith(".tiktok.com")
  ) {
    setStatus(
      "Downly hanya mendukung TikTok."
    );
    return;
  }

  sedangProses = true;

  if (tombol) {
    tombol.disabled = true;
  }

  bersihkanHasil();

  if (progressBox) {
    progressBox.hidden = false;
  }

  setProgress(20);
  setStatus("Menghubungi TikWM...");

  try {
    setProgress(45);

    const data = await ambilDataTikTok(url);

    setProgress(75);

    tampilkanHasil(data);

    setProgress(100);

    mulaiCooldown();
  } catch (error) {
    console.error("Downly error:", error);

    bersihkanHasil();

    setStatus("Gagal: " + error.message);
  } finally {
    sedangProses = false;

    if (progressBox) {
      progressBox.hidden = true;
    }

    if (!cooldown && tombol) {
      tombol.disabled = false;
      tombol.textContent = "Download";
    }
  }
});

/* SETTINGS */

function muatSettings() {
  const gelap =
    localStorage.getItem("downlyDarkMode") === "true";

  const otomatis =
    localStorage.getItem("downlyAutoPreview") === "true";

  if (darkMode) {
    darkMode.checked = gelap;
  }

  if (autoPreview) {
    autoPreview.checked = otomatis;
  }

  document.body.classList.toggle(
    "dark-mode",
    gelap
  );
}

darkMode?.addEventListener("change", () => {
  const aktif = darkMode.checked;

  document.body.classList.toggle(
    "dark-mode",
    aktif
  );

  localStorage.setItem(
    "downlyDarkMode",
    String(aktif)
  );
});

autoPreview?.addEventListener("change", () => {
  localStorage.setItem(
    "downlyAutoPreview",
    String(autoPreview.checked)
  );
});

resetSettings?.addEventListener("click", () => {
  localStorage.removeItem("downlyDarkMode");
  localStorage.removeItem("downlyAutoPreview");

  muatSettings();

  if (video) {
    video.pause();
  }
});

muatSettings();