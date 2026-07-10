gsap.registerPlugin(ScrollTrigger);

const MEDIA = window.PORTFOLIO_MEDIA || {};
const SEQ = MEDIA.hero || { frames: 0 };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* small screens and data-saver connections load every 2nd frame; the
   crossfade in drawFrame hides the bigger steps */
const FRAME_STRIDE =
  window.matchMedia("(max-width: 899px)").matches ||
  (navigator.connection && navigator.connection.saveData)
    ? 2
    : 1;
const FRAME_COUNT = SEQ.frames ? Math.floor((SEQ.frames - 1) / FRAME_STRIDE) + 1 : 0;

/* ---------- smooth scroll ---------- */
const lenis = new Lenis({ lerp: 0.09 });
window.lenis = lenis;
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target);
  });
});

/* ---------- content loading ---------- */
async function loadContent() {
  try {
    const res = await fetch("content.json?v=" + Date.now());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* content.json is admin-edited, not visitor input, but escape anyway so a
   compromised admin key cannot inject script into every visitor's page */
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function renderContent(c) {
  if (!c) return;

  /* hero */
  document.querySelector(".hero-kicker").textContent = c.hero.kicker;
  const lines = document.querySelectorAll(".display-line");
  lines[0].textContent = c.hero.line1;
  lines[1].textContent = c.hero.line2;
  document.getElementById("hero-sub").textContent = c.hero.subtitle;
  document.querySelector(".hero-now").textContent = c.hero.now;

  /* stats */
  const statsSection = document.getElementById("stats");
  statsSection.innerHTML = "";
  c.stats.forEach((s) => {
    const stat = document.createElement("div");
    stat.className = "stat";
    const unit = s.unit ? `<span class="stat-unit">${esc(s.unit)}</span>` : "";
    stat.innerHTML = `
      <div class="stat-value"><span class="count" data-value="${esc(s.value)}" data-decimals="${esc(s.decimals)}">0</span>${unit}</div>
      <div class="stat-label">${esc(s.label)}</div>`;
    statsSection.appendChild(stat);
  });

  /* pillars */
  document.querySelector("#pillars .section-kicker").textContent = c.pillars.kicker;
  const pillarsWrap = document.querySelector(".pillars-wrap");
  pillarsWrap.querySelectorAll(".pillar").forEach((el) => el.remove());
  c.pillars.items.forEach((item, i) => {
    const pillar = document.createElement("div");
    pillar.className = "pillar";
    pillar.innerHTML = `
      <span class="pillar-index">${String(i + 1).padStart(2, "0")}</span>
      <h2>${esc(item.title)}</h2>
      <p>${esc(item.text)}</p>`;
    pillarsWrap.appendChild(pillar);
  });

  /* work */
  document.querySelector("#work .section-kicker").textContent = c.work.kicker;
  document.querySelector(".work-title").textContent = c.work.title;
  const cards = document.querySelector(".cards");
  cards.innerHTML = "";
  c.work.cards.forEach((card, i) => {
    const article = document.createElement("article");
    article.className = "card";
    const tags = card.tags.map((t) => `<li>${esc(t)}</li>`).join("");
    const linkHref = card.link && /^(https?:|mailto:|#)/.test(card.link.href) ? card.link.href : "";
    const link = linkHref
      ? `<a class="card-link" href="${esc(linkHref)}" target="_blank" rel="noopener">${esc(card.link.label)}</a>`
      : "";
    const ytId = card.youtube && /^[\w-]{6,20}$/.test(card.youtube) ? card.youtube : "";
    const video = ytId
      ? `<div class="card-video" data-yt="${ytId}" style="background-image:url('https://i.ytimg.com/vi/${ytId}/hqdefault.jpg')"><button class="card-video-play" aria-label="Play demo video"></button></div>`
      : "";
    article.innerHTML = `
      <span class="card-index">${String(i + 1).padStart(2, "0")}</span>
      <h3>${esc(card.title)}</h3>
      <p>${esc(card.text)}</p>
      <ul class="tags">${tags}</ul>
      ${video}
      ${link}`;
    cards.appendChild(article);
  });
  /* click-to-play lite embed: nothing from YouTube loads until the user clicks */
  cards.addEventListener("click", (e) => {
    const box = e.target.closest(".card-video");
    if (!box || box.classList.contains("playing")) return;
    box.classList.add("playing");
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${box.dataset.yt}?autoplay=1" title="Project demo video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  });

  /* live demos */
  if (c.demos) {
    document.querySelector("#demos .section-kicker").textContent = c.demos.kicker;
    document.querySelector(".demos-title").textContent = c.demos.title;
    const demoGrid = document.querySelector(".demo-grid");
    demoGrid.innerHTML = "";
    c.demos.items.forEach((demo) => {
      const article = document.createElement("article");
      article.className = "demo";
      const demoUrl = demo.url && /^https?:\/\//.test(demo.url) ? demo.url : "";
      const launch = demoUrl
        ? `<button class="demo-launch">${esc(demo.cta || "Launch demo")} &rarr;</button>`
        : `<span class="demo-pending">Publishing soon</span>`;
      article.innerHTML = `
        <div class="demo-head">
          <h3>${esc(demo.title)}</h3>
          <p>${esc(demo.text)}</p>
        </div>
        <div class="demo-frame" data-src="${esc(demoUrl)}" data-zoom="${esc(demo.zoom || "")}" data-title="${esc(demo.title || "Live demo")}">
          <div class="demo-preview">${launch}</div>
        </div>`;
      demoGrid.appendChild(article);
    });
    /* click-to-load: the iframe (and any Groq usage) only starts on click */
    demoGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".demo-launch");
      if (!btn) return;
      const frame = btn.closest(".demo-frame");
      if (!frame || frame.classList.contains("loaded") || !frame.dataset.src) return;
      frame.classList.add("loaded");
      /* optional zoom: render the iframe at a smaller area, then scale it up */
      const zoom = parseFloat(frame.dataset.zoom);
      const style = zoom > 1
        ? ` style="width:${(100 / zoom).toFixed(2)}%;height:${(100 / zoom).toFixed(2)}%;transform:scale(${zoom});transform-origin:0 0"`
        : "";
      frame.innerHTML =
        `<iframe src="${esc(frame.dataset.src)}" title="${esc(frame.dataset.title || "Live demo")}"${style} allow="fullscreen" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
    });
  }

  /* skills */
  document.querySelector("#skills .section-kicker").textContent = c.skills.kicker;
  document.querySelector(".skills-title").textContent = c.skills.title;
  const skillGroups = document.querySelector(".skill-groups");
  skillGroups.innerHTML = "";
  c.skills.groups.forEach((group) => {
    const div = document.createElement("div");
    div.className = "skill-group";
    const items = group.items.map((item) => `<li>${esc(item)}</li>`).join("");
    div.innerHTML = `<h3>${esc(group.category)}</h3><ul class="tags">${items}</ul>`;
    skillGroups.appendChild(div);
  });

  /* experience */
  document.querySelector("#experience .section-kicker").textContent = c.experience.kicker;
  document.querySelector(".experience-title").textContent = c.experience.title;
  const expRows = document.querySelector(".exp-rows");
  expRows.innerHTML = "";
  c.experience.rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "exp-row";
    li.innerHTML = `
      <span class="exp-org">${esc(row.org)}</span>
      <span class="exp-role">${esc(row.role)}</span>
      <span class="exp-date">${esc(row.date)}</span>`;
    expRows.appendChild(li);
  });

  /* finale */
  document.querySelector("#contact .section-kicker").textContent = c.finale.kicker;
  document.querySelector(".finale-title").innerHTML =
    `${esc(c.finale.titlePre)}<br><em>${esc(c.finale.titleEm)}</em> ${esc(c.finale.titlePost)}`;
  const primaryBtn = document.querySelector(".btn-primary");
  primaryBtn.textContent = c.finale.primary.label;
  primaryBtn.href = c.finale.primary.href;
  const secondaryBtn = document.querySelector(".btn-ghost");
  secondaryBtn.textContent = c.finale.secondary.label;
  secondaryBtn.href = c.finale.secondary.href;

  /* CV download: rendered only when content.json sets finale.cv to a path */
  if (c.finale.cv) {
    const cvBtn = document.createElement("a");
    cvBtn.className = "btn btn-ghost";
    cvBtn.href = c.finale.cv;
    cvBtn.textContent = "Download CV";
    document.querySelector(".finale-actions").appendChild(cvBtn);
    const navCv = document.createElement("a");
    navCv.href = c.finale.cv;
    navCv.textContent = "CV";
    const navLinks = document.querySelector(".nav-links");
    navLinks.insertBefore(navCv, navLinks.querySelector('a[href*="linkedin"]'));
  }

  /* footer */
  document.querySelector(".footer span").textContent = c.footer.copyright;
  const emailLink = document.querySelector('.footer-links a[href^="mailto:"]');
  emailLink.href = "mailto:" + c.footer.email;
  emailLink.textContent = c.footer.email;
  const linkedinLink = document.querySelector('.footer-links a[href*="linkedin"]');
  linkedinLink.href = c.footer.linkedin;
}

/* ---------- split display type into letters ---------- */
function splitDisplayLines() {
  document.querySelectorAll(".display-line").forEach((line) => {
    const text = line.textContent.trim();
    line.textContent = "";
    [...text].forEach((ch) => {
      const span = document.createElement("span");
      span.className = "ch";
      span.textContent = ch;
      line.appendChild(span);
    });
  });
}

/* ---------- hero frame sequence ---------- */
const canvas = document.getElementById("hero-canvas");
const ctx = canvas.getContext("2d");
const frames = [];
let frameIndex = 0;

const loaderFill = document.getElementById("loader-fill");
const loaderPct = document.getElementById("loader-pct");

function setProgress(p) {
  const pct = Math.round(p * 100);
  loaderFill.style.width = pct + "%";
  loaderPct.textContent = pct + "%";
}

function frameSrc(i) {
  return SEQ.base + String(i * FRAME_STRIDE + 1).padStart(SEQ.pad, "0") + SEQ.ext;
}

function preloadFrames() {
  return new Promise((resolve) => {
    if (!FRAME_COUNT) {
      /* setTimeout instead of a tween: rAF is paused in hidden tabs and would stall init */
      setProgress(1);
      setTimeout(resolve, 250);
      return;
    }
    let done = 0;
    const finish = () => {
      done++;
      setProgress(done / FRAME_COUNT);
      if (done === FRAME_COUNT) resolve();
    };
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.onload = () => {
        /* pre-decode into a bitmap so scrubbing never decodes on the main thread */
        if (typeof createImageBitmap === "function") {
          createImageBitmap(img)
            .then((bmp) => { frames[i] = bmp; })
            .catch(() => { frames[i] = img; })
            .then(finish);
        } else {
          frames[i] = img;
          finish();
        }
      };
      img.onerror = finish;
      img.src = frameSrc(i);
    }
  });
}

function sizeCanvas() {
  /* cap the backing store: frames are 1440px wide, anything past 1920 is pure fill cost */
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const scale = Math.min(dpr, 1920 / Math.max(1, canvas.clientWidth));
  canvas.width = Math.round(canvas.clientWidth * scale);
  canvas.height = Math.round(canvas.clientHeight * scale);
  drawFrame(frameIndex);
}

/* cover-fit blit of one frame; optional alpha for crossfade layering */
function blit(img, alpha) {
  if (!img) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.max(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  ctx.globalAlpha = 1;
}

/* drawFrame accepts a fractional index and crossfades between the two nearest
   frames, so the arc where the source clip speeds up smears instead of stepping */
function drawFrame(f) {
  if (!FRAME_COUNT) { drawFallback(); return; }
  const clamped = Math.max(0, Math.min(FRAME_COUNT - 1, f));
  const i0 = Math.floor(clamped);
  const i1 = Math.min(FRAME_COUNT - 1, i0 + 1);
  const t = clamped - i0;
  const cw = canvas.width;
  const ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);
  blit(frames[i0], 1);
  if (t > 0.001 && i1 !== i0) blit(frames[i1], t);
}

/* animated teal void while no footage exists */
const t0 = performance.now();
function drawFallback() {
  const cw = canvas.width;
  const ch = canvas.height;
  if (!cw || !ch) return;
  const t = (performance.now() - t0) / 1000;
  const r = ch * (0.75 + 0.06 * Math.sin(t * 0.6));
  const g = ctx.createRadialGradient(cw * 0.5, ch * 0.6, ch * 0.05, cw * 0.5, ch * 0.55, r);
  g.addColorStop(0, "#0f3d3d");
  g.addColorStop(0.55, "#071417");
  g.addColorStop(1, "#040507");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
}
if (!FRAME_COUNT && !reduceMotion) gsap.ticker.add(drawFallback);

/* ---------- intro reveal ---------- */
function reveal() {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  tl.to("#loader", { autoAlpha: 0, duration: 0.6 })
    .from(".hero-kicker", { y: 24, autoAlpha: 0, duration: 0.7 }, "-=0.1")
    .from(".display .ch", { yPercent: 120, duration: 0.9, stagger: 0.045 }, "-=0.4")
    .from("#hero-sub", { y: 24, autoAlpha: 0, duration: 0.7 }, "-=0.5")
    .from(".nav", { y: -16, autoAlpha: 0, duration: 0.6 }, "-=0.5")
    .from(".scroll-hint", { autoAlpha: 0, duration: 0.6 }, "-=0.3");
  /* hidden tab: rAF is paused, jump straight to the end state */
  if (document.hidden) tl.progress(1);
}

/* ---------- scroll choreography ---------- */
function buildScroll() {
  /* hero: pinned scrub through the orbit */
  gsap.timeline({
    scrollTrigger: {
      trigger: "#hero",
      start: "top top",
      end: "+=300%",
      pin: true,
      scrub: 0.4,
      onUpdate(self) {
        if (!FRAME_COUNT) return;
        const f = self.progress * (FRAME_COUNT - 1);
        /* redraw only on a meaningful move; blend needs the fractional position */
        if (Math.abs(f - frameIndex) > 0.02) { frameIndex = f; drawFrame(f); }
      }
    }
  })
    .to(".hero-content", { yPercent: -35, autoAlpha: 0, ease: "none", duration: 0.45 }, 0.55)
    .to(".scroll-hint", { autoAlpha: 0, ease: "none", duration: 0.1 }, 0.05);

  /* stats: slide in, then count up */
  gsap.from(".stat", {
    y: 40,
    autoAlpha: 0,
    stagger: 0.15,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: "#stats", start: "top 80%" }
  });
  document.querySelectorAll(".count").forEach((el) => {
    const target = parseFloat(el.dataset.value);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const obj = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () =>
        gsap.to(obj, {
          v: target,
          duration: 1.6,
          ease: "power2.out",
          onUpdate: () => { el.textContent = obj.v.toFixed(decimals); }
        })
    });
  });

  /* pillars: pinned, revealed one by one */
  const pillarTl = gsap.timeline({
    scrollTrigger: {
      trigger: "#pillars",
      start: "top top",
      end: "+=250%",
      pin: true,
      scrub: 0.6
    }
  });
  document.querySelectorAll(".pillar").forEach((p, i) => {
    pillarTl.fromTo(p, { autoAlpha: 0, y: 80 }, { autoAlpha: 1, y: 0, duration: 1 }, i);
  });
  pillarTl.to({}, { duration: 0.7 });

  /* work cards */
  gsap.from(".work-title", {
    y: 50,
    autoAlpha: 0,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: "#work", start: "top 70%" }
  });
  gsap.from(".card", {
    y: 60,
    autoAlpha: 0,
    stagger: 0.12,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: ".cards", start: "top 82%" }
  });

  /* live demos */
  gsap.from(".demos-title", {
    y: 50,
    autoAlpha: 0,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: "#demos", start: "top 80%" }
  });
  gsap.from(".demo", {
    y: 40,
    autoAlpha: 0,
    stagger: 0.15,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: ".demo-grid", start: "top 80%" }
  });

  /* experience */
  gsap.from(".experience-title", {
    y: 50,
    autoAlpha: 0,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: "#experience", start: "top 80%" }
  });
  gsap.from(".exp-row", {
    y: 30,
    autoAlpha: 0,
    stagger: 0.08,
    duration: 0.7,
    ease: "power3.out",
    scrollTrigger: { trigger: "#experience", start: "top 75%" }
  });

  /* skills */
  gsap.from(".skills-title", {
    y: 50,
    autoAlpha: 0,
    duration: 0.8,
    ease: "power3.out",
    scrollTrigger: { trigger: "#skills", start: "top 80%" }
  });
  gsap.from(".skill-group", {
    y: 30,
    autoAlpha: 0,
    stagger: 0.1,
    duration: 0.7,
    ease: "power3.out",
    scrollTrigger: { trigger: "#skills", start: "top 75%" }
  });

  /* finale */
  gsap.from(".finale > *", {
    y: 40,
    autoAlpha: 0,
    stagger: 0.12,
    duration: 0.9,
    ease: "power3.out",
    scrollTrigger: { trigger: "#contact", start: "top 72%" }
  });
}

/* ---------- background clips ---------- */
function bindVideo(id) {
  const v = document.getElementById(id);
  if (!v) return;
  const act = v.closest(".act");
  const fail = () => act.classList.add("no-video");
  v.addEventListener("error", fail, true);
  const src = v.querySelector("source");
  if (src) src.addEventListener("error", fail);
  /* the error may already have fired before this runs */
  if (v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) fail();
  ScrollTrigger.create({
    trigger: act,
    start: "top bottom",
    end: "bottom top",
    onEnter: () => v.play().catch(() => {}),
    onEnterBack: () => v.play().catch(() => {}),
    onLeave: () => v.pause(),
    onLeaveBack: () => v.pause()
  });
}

/* ---------- contact modal ---------- */
function bindContactModal() {
  const modal = document.getElementById("contact-modal");
  if (!modal) return;
  const openBtn = document.querySelector(".finale-actions .btn-primary");
  const closeBtn = modal.querySelector(".modal-close");
  const backdrop = modal.querySelector(".modal-backdrop");
  const form = modal.querySelector("#contact-form");
  const status = modal.querySelector(".form-status");
  const nameField = form.querySelector('[name="name"]');
  let lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    if (window.lenis) window.lenis.stop();
    requestAnimationFrame(() => {
      modal.classList.add("open");
      nameField.focus();
    });
  }
  function close() {
    modal.classList.remove("open");
    document.body.classList.remove("modal-open");
    if (window.lenis) window.lenis.start();
    setTimeout(() => { modal.hidden = true; }, 300);
    if (lastFocus) lastFocus.focus();
  }

  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    const payload = {
      name: form.name.value,
      email: form.email.value,
      message: form.message.value,
      website: form.website.value
    };
    submitBtn.disabled = true;
    status.textContent = "Sending...";
    status.style.color = "";
    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || !body.ok) throw new Error((body && body.error) || "Send failed");
        form.innerHTML = '<p class="form-thanks">Thanks! Your note is on its way.</p>';
      })
      .catch(() => {
        submitBtn.disabled = false;
        const email = document.querySelector('.footer-links a[href^="mailto:"]');
        const addr = email ? email.textContent : "pyry.kiviluoma@aalto.fi";
        status.innerHTML =
          'Could not send. Please email me at <a href="mailto:' + addr + '">' + addr + "</a>.";
        status.style.color = "var(--teal)";
      });
  });
}

/* ---------- reduced motion ---------- */
function initReduced() {
  gsap.set("#loader", { autoAlpha: 0 });
  document.querySelectorAll(".count").forEach((el) => {
    el.textContent = parseFloat(el.dataset.value).toFixed(parseInt(el.dataset.decimals || "0", 10));
  });
  drawFrame(0);
}

/* ---------- init ---------- */
async function start() {
  const c = await loadContent();
  renderContent(c);
  splitDisplayLines();
  bindContactModal();
  Promise.all([preloadFrames(), document.fonts.ready]).then(() => {
    sizeCanvas();
    if (reduceMotion) { initReduced(); return; }
    buildScroll();
    bindVideo("builder-video");
    bindVideo("closer-video");
    reveal();
  });
}
window.addEventListener("resize", sizeCanvas);
start();
