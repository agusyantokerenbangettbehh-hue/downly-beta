const root = document.documentElement, MIN = 2800;
const pre = document.getElementById("preloader"), fill = document.getElementById("preFill"), pct = document.getElementById("prePct"), txt = document.getElementById("preText");
const steps = [[0, "Menyiapkan Downly…"], [30, "Memuat tampilan…"], [60, "Menghubungi server…"], [88, "Hampir siap…"], [100, "Siap!"]];
let loaded = document.readyState === "complete", finished = false;
addEventListener("load", () => { loaded = true; });

function observe() {
  if (!root.classList.contains("js-anim") || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 });
  document.querySelectorAll("section:not(.hero), footer").forEach((el, i) => { el.classList.add("reveal"); el.style.setProperty("--d", (i % 4) * 70 + "ms"); io.observe(el); });
}

function paint(p) {
  if (!fill) return;
  fill.style.width = p + "%"; pct.textContent = p + "%";
  txt.textContent = steps.filter(s => s[0] <= p).pop()[1];
}

function finish() {
  if (finished) return; finished = true;
  paint(100);
  setTimeout(() => {
    document.body.classList.add("loaded");
    if (pre) { pre.classList.add("hide"); setTimeout(() => pre.remove(), 1100); }
    setTimeout(observe, 500);
  }, root.classList.contains("js-anim") ? 350 : 0);
}

function tick() {
  if (finished) return;
  const t = Math.min(1, performance.now() / MIN);
  let p = Math.round((1 - Math.pow(1 - t, 2)) * 100);
  if (!loaded) p = Math.min(p, 92);
  paint(Math.min(p, 99));
  if (t >= 1 && loaded) return finish();
  requestAnimationFrame(tick);
}

if (!root.classList.contains("js-anim")) finish(); else { tick(); setTimeout(finish, 9000); }
