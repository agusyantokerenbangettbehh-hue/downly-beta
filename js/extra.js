import { BACKEND_BASE, platformNames } from "./config.js";
const KEY = "downly_extra_v1";
export const extra = Object.assign({ quality: "best", template: "{judul}" }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(extra)); } catch {} };

export function pickQuality(qs) {
  if (!qs.length || extra.quality === "best") return qs[0];
  const n = q => parseInt(q.label) || 0, t = Number(extra.quality);
  const ok = qs.filter(q => n(q) && n(q) <= t).sort((a, b) => n(b) - n(a));
  return ok[0] || qs[qs.length - 1];
}

export function applyTemplate(m) {
  const d = new Date().toISOString().slice(0, 10);
  const out = (extra.template || "{judul}").replace(/\{platform\}/g, m.platform || "").replace(/\{username\}/g, m.username || "").replace(/\{judul\}/g, m.title || "").replace(/\{tanggal\}/g, d);
  return out.replace(/-{2,}/g, "-").replace(/^[-\s]+|[-\s]+$/g, "") || m.title || "downly";
}

async function ping(url, ms = 60000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { await fetch(url, { mode: "no-cors", cache: "no-store", signal: c.signal }); return true; } catch { return false; } finally { clearTimeout(t); }
}

function checkStatus() {
  const els = [...document.querySelectorAll(".platform-status")]; if (!els.length) return;
  els.forEach(el => { el.textContent = "mengecek…"; el.classList.remove("is-up", "is-down"); });
  const jobs = { backend: ping(BACKEND_BASE + "/"), tikwm: ping("https://www.tikwm.com/") };
  els.forEach(async el => {
    const text = (el.parentElement?.textContent || "").toLowerCase();
    const key = Object.keys(platformNames).find(k => text.includes(platformNames[k].split(" ").pop().toLowerCase())) || "";
    const ok = key === "tiktok" ? (await jobs.tikwm) || (await jobs.backend) : await jobs.backend;
    el.textContent = ok ? "aktif" : "mati"; el.classList.add(ok ? "is-up" : "is-down");
  });
}

export function initExtra() {
  const reset = document.getElementById("resetSettings");
  if (reset) {
    const box = document.createElement("div"); box.className = "extra-settings";
    box.innerHTML = '<label>Kualitas default<select id="defQuality"><option value="best">Terbaik</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></label><label>Template nama file<input id="nameTpl" type="text" placeholder="{platform}-{username}-{judul}"></label><small>Pakai {platform} {username} {judul} {tanggal}</small>';
    reset.before(box);
    const q = box.querySelector("#defQuality"), t = box.querySelector("#nameTpl");
    q.value = extra.quality; t.value = extra.template;
    q.addEventListener("change", () => { extra.quality = q.value; save(); });
    t.addEventListener("input", () => { extra.template = t.value; save(); });
  }
  const f = document.getElementById("filterHistory");
  if (f) Object.entries(platformNames).forEach(([k, v]) => { const o = document.createElement("option"); o.value = "platform:" + k; o.textContent = v; f.appendChild(o); });
  const shared = new URLSearchParams(location.search), raw = shared.get("url") || shared.get("text") || "", m = raw.match(/https?:\/\/\S+/), input = document.getElementById("url");
  if (m && input) { input.value = m[0]; const s = document.getElementById("statusDownload"); if (s) s.textContent = "Tautan dari menu Bagikan sudah terisi."; history.replaceState(null, "", location.pathname); }
  checkStatus();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
