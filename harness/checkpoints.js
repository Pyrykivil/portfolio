/* Visual-verification harness. Injected via a script tag by the orchestrating
   agent, not referenced from index.html. Exposes window.__harness. */
(function () {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
    window.__harness = { error: "gsap not loaded" };
    return;
  }

  const NAMES = [
    "hero-start", "hero-mid", "hero-end",
    "stats",
    "pillar-1", "pillar-2", "pillar-3",
    "work", "finale"
  ];

  function stFor(triggerId) {
    return ScrollTrigger.getAll().find((st) => st.trigger && st.trigger.id === triggerId);
  }

  function pinY(triggerId, fraction) {
    const st = stFor(triggerId);
    if (!st) return 0;
    return st.start + fraction * (st.end - st.start);
  }

  function sectionTopY(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    return top - window.innerHeight * 0.6;
  }

  function targetY(name) {
    switch (name) {
      case "hero-start": return pinY("hero", 0.02);
      case "hero-mid": return pinY("hero", 0.5);
      case "hero-end": return pinY("hero", 0.95);
      case "pillar-1": return pinY("pillars", 0.3);
      case "pillar-2": return pinY("pillars", 0.57);
      case "pillar-3": return pinY("pillars", 0.84);
      case "stats": return sectionTopY("stats");
      case "work": return sectionTopY("work");
      case "finale": return sectionTopY("contact");
      default: return 0;
    }
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function goto(name) {
    const y = targetY(name);
    /* scroll through Lenis when present so its smoothing does not fight the jump */
    if (window.lenis) window.lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo({ top: y, left: 0, behavior: "auto" });
    /* hidden tabs pause rAF and clamp timers, so sync animation state directly
       instead of waiting for ticker time to pass */
    ScrollTrigger.update();
    ScrollTrigger.getAll().forEach((st) => {
      if (!st.animation) return;
      if (st.vars.scrub) st.animation.progress(st.progress);
      else st.animation.progress(st.progress > 0 ? 1 : 0);
    });
    await wait(50);
  }

  function computedOpacity(el) {
    if (!el) return 0;
    return parseFloat(getComputedStyle(el).opacity) || 0;
  }

  function canvasBlank() {
    try {
      const canvas = document.getElementById("hero-canvas");
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      const x = Math.floor(canvas.width / 2);
      const y = Math.floor(canvas.height / 2);
      const data = ctx.getImageData(x, y, 1, 1).data;
      const isBlack = data[0] === 0 && data[1] === 0 && data[2] === 0;
      const isTransparent = data[3] === 0;
      return isBlack || isTransparent;
    } catch (e) {
      return null;
    }
  }

  function report() {
    const media = window.PORTFOLIO_MEDIA || {};
    const pillars = document.querySelectorAll(".pillar");
    const pillarsEl = document.getElementById("pillars");
    const workEl = document.getElementById("work");
    return {
      scrollY: window.scrollY,
      loaderVisible: computedOpacity(document.getElementById("loader")) > 0.01,
      heroFrames: (media.hero || {}).frames,
      noVideo: {
        builder: !!(pillarsEl && pillarsEl.classList.contains("no-video")),
        closer: !!(workEl && workEl.classList.contains("no-video"))
      },
      counts: [...document.querySelectorAll(".count")].map((el) => el.textContent),
      pillarsVisible: [...pillars].map((el) => computedOpacity(el) > 0.9),
      cardCount: document.querySelectorAll(".card").length,
      canvasBlank: canvasBlank()
    };
  }

  function list() {
    return NAMES.slice();
  }

  window.__harness = { goto, report, list };
})();
