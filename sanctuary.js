/**
 * Sleep Sanctuary — ambient Web Audio + optional guided file or spoken chapters.
 */

const STORAGE = {
  preset: "ss_preset",
  intensity: "ss_intensity",
  timerMin: "ss_timer_min",
  speech: "ss_speech",
  loopGuided: "ss_loop_guided",
};

const PRESETS = [
  { id: "rain", label: "Rain in Kyoto", icon: "water_drop" },
  { id: "ocean", label: "Tidal Blue", icon: "waves" },
  { id: "forest", label: "Moss & Wind", icon: "forest" },
  { id: "brown", label: "Brown noise", icon: "graphic_eq" },
];

const SPEECH_CHAPTERS = [
  {
    text: "Welcome. You have arrived exactly where you need to be. There is nothing to fix in this moment — only room to soften.",
    pauseAfter: 4500,
  },
  {
    text: "Let your shoulders fall, just a millimeter. Let the weight of the day rest on the floor beneath you.",
    pauseAfter: 5000,
  },
  {
    text: "Breathe in gently through your nose, and let the exhale leave without effort, like mist dissolving.",
    pauseAfter: 5500,
  },
  {
    text: "Notice the ambient bed you hear. It is a lantern in the dark — steady, patient, unhurried.",
    pauseAfter: 4500,
  },
  {
    text: "If thoughts appear, treat them as clouds crossing a quiet sky. You do not have to follow them.",
    pauseAfter: 5000,
  },
  {
    text: "Scan your face: unfurl the brow, soften the jaw, release the tongue from the roof of the mouth.",
    pauseAfter: 5500,
  },
  {
    text: "Feel the gentle rise of your belly with each inhale. Let the exhale be longer than the inhale, easy and kind.",
    pauseAfter: 6000,
  },
  {
    text: "Imagine a cool silver light at the crown of your head, melting warmth down through neck, heart, and hips.",
    pauseAfter: 6000,
  },
  {
    text: "The world can wait. This time is a small sanctuary carved only for you.",
    pauseAfter: 5000,
  },
  {
    text: "Rest here. Drift if you wish. The whispers will end when you are ready — the calm can stay.",
    pauseAfter: 4000,
  },
];

function $(id) {
  return document.getElementById(id);
}

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("opacity-0", "pointer-events-none");
  el.classList.add("opacity-100");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.add("opacity-0", "pointer-events-none");
    el.classList.remove("opacity-100");
  }, 3200);
}

function announce(msg) {
  const el = $("status-announcer");
  if (el) el.textContent = msg;
}

function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/* --- Ambient engine (Web Audio synthesis) --- */

function fillBrownNoise(data) {
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = Math.max(-1, Math.min(1, last * 4.5));
  }
}

function fillWhiteNoise(data) {
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

class AmbientEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.intensity = 0.42;
    this._preset = "rain";
    this._nodes = [];
    this._fadeTask = null;
  }

  async ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  _stopAll() {
    for (const n of this._nodes) {
      try {
        if (n.stop) n.stop();
        n.disconnect?.();
      } catch (_) {}
    }
    this._nodes = [];
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    this._applyGainImmediate();
  }

  _applyGainImmediate() {
    if (!this.master || !this.ctx) return;
    const base = 0.34 * this.intensity;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(base, this.ctx.currentTime);
  }

  async setPreset(id) {
    await this.ensure();
    this._preset = id;
    const now = this.ctx.currentTime;
    const prev = this.master.gain.value;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(prev, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.22);
    this._stopAll();
    await new Promise((r) => setTimeout(r, 230));
    this._buildGraph(id);
    const target = 0.34 * this.intensity;
    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.35);
  }

  _makeNoiseBuffer(sec, fill) {
    const len = Math.floor(this.ctx.sampleRate * sec);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    fill(ch);
    return buf;
  }

  _buildGraph(id) {
    const c = this.ctx;

    if (id === "brown") {
      const buf = this._makeNoiseBuffer(4, fillBrownNoise);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 120;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3800;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(this.master);
      src.start();
      this._nodes.push(src, hp, lp);
      return;
    }

    if (id === "rain") {
      const buf = this._makeNoiseBuffer(2, fillWhiteNoise);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1650;
      bp.Q.value = 0.55;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 7200;
      src.connect(bp);
      bp.connect(lp);
      lp.connect(this.master);
      src.start();
      this._nodes.push(src, bp, lp);
      return;
    }

    if (id === "ocean") {
      const buf = this._makeNoiseBuffer(3, fillBrownNoise);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 650;
      const shelf = c.createBiquadFilter();
      shelf.type = "lowshelf";
      shelf.frequency.value = 280;
      shelf.gain.value = 4;
      src.connect(shelf);
      shelf.connect(lp);
      lp.connect(this.master);
      src.start();
      const lfo = c.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.09;
      const lg = c.createGain();
      lg.gain.value = 320;
      lfo.connect(lg);
      lg.connect(lp.frequency);
      lfo.start();
      this._nodes.push(src, shelf, lp, lfo, lg);
      return;
    }

    if (id === "forest") {
      const bufW = this._makeNoiseBuffer(2.5, fillWhiteNoise);
      const srcW = c.createBufferSource();
      srcW.buffer = bufW;
      srcW.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2200;
      bp.Q.value = 0.35;
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 600;
      srcW.connect(hp);
      hp.connect(bp);
      const bufB = this._makeNoiseBuffer(4, fillBrownNoise);
      const srcB = c.createBufferSource();
      srcB.buffer = bufB;
      srcB.loop = true;
      const wind = c.createBiquadFilter();
      wind.type = "lowpass";
      wind.frequency.value = 900;
      const gW = c.createGain();
      gW.gain.value = 0.55;
      const gB = c.createGain();
      gB.gain.value = 0.35;
      srcB.connect(wind);
      wind.connect(gB);
      bp.connect(gW);
      const mix = c.createGain();
      gW.connect(mix);
      gB.connect(mix);
      mix.connect(this.master);
      mix.gain.value = 1.1;
      srcW.start();
      srcB.start();
      this._nodes.push(srcW, hp, bp, gW, srcB, wind, gB, mix);
    }
  }

  /**
   * @param {string} [id]
   * @param {{ fadeInSec?: number }} [opts] fadeInSec > 0 ramps master from 0 (smoother start)
   */
  async warm(id, opts = {}) {
    await this.ensure();
    this._stopAll();
    this._buildGraph(id || this._preset);
    const fadeIn = typeof opts.fadeInSec === "number" ? opts.fadeInSec : 0;
    if (fadeIn > 0 && this.ctx && this.master) {
      const target = 0.34 * this.intensity;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(0, t);
      this.master.gain.linearRampToValueAtTime(target, t + fadeIn);
    } else {
      this._applyGainImmediate();
    }
  }

  fadeOut(seconds) {
    if (!this.ctx || !this.master) return Promise.resolve();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + seconds);
    return new Promise((r) => setTimeout(r, seconds * 1000 + 40));
  }

  mute() {
    if (!this.ctx || !this.master) return;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.value = 0;
  }
}

/* --- App --- */

const ambient = new AmbientEngine();
const guided = new Audio();
guided.preload = "auto";
/** @type {number | null} */
let guidedVolRamp = null;

let playing = false;
let speechToken = 0;
let speechChapter = 0;
let timerDeadline = null;
let guidedObjectUrl = null;
let rafId = 0;
let currentPresetId = "rain";

const els = {
  play: $("btn-play"),
  playIcon: $("play-icon"),
  back: $("btn-back"),
  forward: $("btn-forward"),
  menu: $("btn-menu"),
  closeMain: $("btn-close"),
  intensity: $("intensity-slider"),
  intensityPct: $("intensity-pct"),
  timerDisplay: $("timer-display"),
  timerSelect: $("timer-select"),
  tileTimer: $("tile-timer"),
  ambientLabel: $("ambient-label"),
  ambientIcon: $("ambient-icon"),
  settingsPanel: $("settings-panel"),
  settingsBackdrop: $("settings-backdrop"),
  settingsClose: $("btn-settings-close"),
  presetList: $("preset-list"),
  toggleSpeech: $("toggle-speech"),
  pickAudio: $("btn-pick-audio"),
  clearAudio: $("btn-clear-audio"),
  fileInput: $("guided-file-input"),
  guidedName: $("guided-file-name"),
  glow: $("celestial-glow"),
  orbIcon: $("orb-icon"),
  sessionSub: $("session-sub"),
  guidedWrap: $("guided-progress-wrap"),
  guidedSeek: $("guided-seek"),
  guidedElapsed: $("guided-elapsed"),
  guidedDuration: $("guided-duration"),
  loopGuide: $("toggle-loop-guided"),
  loopWrap: $("guided-loop-wrap"),
};

function loadStorage() {
  const p = localStorage.getItem(STORAGE.preset);
  if (p && PRESETS.some((x) => x.id === p)) {
    /* applied after warm */
  }
  const i = parseFloat(localStorage.getItem(STORAGE.intensity));
  if (!Number.isNaN(i) && i >= 0 && i <= 100) {
    els.intensity.value = String(Math.round(i));
  }
  const t = localStorage.getItem(STORAGE.timerMin);
  if (t !== null && els.timerSelect.querySelector(`option[value="${t}"]`)) {
    els.timerSelect.value = t;
  }
  const sp = localStorage.getItem(STORAGE.speech);
  if (sp === "0") els.toggleSpeech.checked = false;
  const lp = localStorage.getItem(STORAGE.loopGuided);
  if (els.loopGuide && lp === "1") els.loopGuide.checked = true;
  return {
    preset: PRESETS.some((x) => x.id === p) ? p : "rain",
  };
}

function saveStorage() {
  localStorage.setItem(STORAGE.preset, currentPresetId);
  localStorage.setItem(STORAGE.intensity, els.intensity.value);
  localStorage.setItem(STORAGE.timerMin, els.timerSelect.value);
  localStorage.setItem(STORAGE.speech, els.toggleSpeech.checked ? "1" : "0");
  if (els.loopGuide) {
    localStorage.setItem(STORAGE.loopGuided, els.loopGuide.checked ? "1" : "0");
  }
}

function pickVoice() {
  const v = speechSynthesis.getVoices();
  const calm =
    v.find((x) => /Samantha|Serena|Karen|Victoria|Martha/i.test(x.name)) ||
    v.find((x) => x.lang === "en-GB") ||
    v.find((x) => x.lang.startsWith("en")) ||
    v[0];
  return calm || null;
}

function prefersCustomGuided() {
  return Boolean(guided.src);
}

function shouldSpeak() {
  return els.toggleSpeech.checked && !prefersCustomGuided();
}

function setPlayUi(isPlaying) {
  playing = isPlaying;
  els.play.setAttribute("aria-label", isPlaying ? "Pause session" : "Play session");
  els.playIcon.textContent = isPlaying ? "pause" : "play_arrow";
  els.playIcon.classList.toggle("material-symbols-filled", isPlaying);
  els.playIcon.classList.toggle("material-symbols-outlined", !isPlaying);
  els.orbIcon.classList.toggle("text-primary-fixed-dim/70", isPlaying);
  els.orbIcon.classList.toggle("text-primary-fixed-dim/50", !isPlaying);
  els.glow.classList.toggle("opacity-55", isPlaying);
  els.glow.classList.toggle("opacity-40", !isPlaying);
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }
}

function resetTimerFromSelection() {
  const min = parseInt(els.timerSelect.value, 10);
  if (!min) {
    timerDeadline = null;
    els.timerDisplay.textContent = "—";
    announce("Sleep timer off");
    return;
  }
  timerDeadline = Date.now() + min * 60 * 1000;
  announce(`Sleep timer ${min} minutes`);
}

function tick() {
  if (timerDeadline === null) {
    rafId = requestAnimationFrame(tick);
    return;
  }
  const left = Math.max(0, timerDeadline - Date.now());
  els.timerDisplay.textContent = formatMs(left);
  if (left <= 0) {
    timerDeadline = null;
    endByTimer();
  }
  rafId = requestAnimationFrame(tick);
}

async function endByTimer() {
  announce("Sleep timer ended");
  speechSynthesis.cancel();
  await fadeOutSession(2.8);
  pauseCore({ skipTimerReset: true });
  toast("Timer ended — rest well");
}

async function fadeOutSession(sec) {
  const g = guided;
  const steps = Math.max(8, Math.floor(sec * 30));
  const startA = g.volume;
  const startM = ambient.master ? ambient.master.gain.value : 0;
  cancelGuidedVolRamp();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    g.volume = startA * (1 - t);
    if (ambient.master && ambient.ctx) {
      const now = ambient.ctx.currentTime;
      ambient.master.gain.cancelScheduledValues(now);
      ambient.master.gain.setValueAtTime(startM * (1 - t), now);
    }
    await new Promise((r) => setTimeout(r, (sec * 1000) / steps));
  }
  g.volume = 1;
  ambient.mute();
}

function cancelGuidedVolRamp() {
  if (guidedVolRamp !== null) {
    cancelAnimationFrame(guidedVolRamp);
    guidedVolRamp = null;
  }
}

/** @param {number} to */
function rampGuidedVolume(to, ms = 380) {
  cancelGuidedVolRamp();
  const from = guided.volume;
  const t0 = performance.now();
  const step = (now) => {
    const u = Math.min(1, (now - t0) / ms);
    guided.volume = from + (to - from) * u;
    if (u < 1) guidedVolRamp = requestAnimationFrame(step);
    else guidedVolRamp = null;
  };
  guidedVolRamp = requestAnimationFrame(step);
}

function speakNextChapter(startIndex, myToken) {
  if (myToken !== speechToken) return;
  if (!playing) return;
  if (startIndex >= SPEECH_CHAPTERS.length) {
    speechChapter = 0;
    announce("Guided narration complete — ambient continues");
    toast("Guidance complete");
    return;
  }
  speechChapter = startIndex;
  const ch = SPEECH_CHAPTERS[startIndex];
  const u = new SpeechSynthesisUtterance(ch.text);
  u.rate = 0.9;
  u.pitch = 1;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.onend = () => {
    if (myToken !== speechToken || !playing) return;
    const pause = ch.pauseAfter || 3000;
    setTimeout(() => speakNextChapter(startIndex + 1, myToken), pause);
  };
  u.onerror = () => {
    if (myToken !== speechToken) return;
    toast("Voice guidance hit a snag — try reloading");
  };
  speechSynthesis.speak(u);
}

async function playCore() {
  try {
    await ambient.ensure();
    await ambient.warm(currentPresetId, { fadeInSec: 0.55 });
    if (prefersCustomGuided()) {
      guided.volume = 0;
      await guided.play();
      rampGuidedVolume(1, 420);
      updateGuidedProgressUi();
      startGuidedProgressLoop();
    } else {
      guided.volume = 1;
      stopGuidedProgressLoop();
    }
    if (!prefersCustomGuided() && shouldSpeak()) {
      speechToken++;
      const t = speechToken;
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      speakNextChapter(speechChapter, t);
    }
    setPlayUi(true);
    saveStorage();
    setupMediaSession();
    updateMediaSessionPosition();
  } catch (e) {
    console.error(e);
    toast("Could not start audio — tap play again");
    setPlayUi(false);
    cancelGuidedVolRamp();
    guided.volume = 1;
  }
}

function pauseCore(opts = {}) {
  speechToken++;
  speechSynthesis.cancel();
  cancelGuidedVolRamp();
  guided.volume = 1;
  guided.pause();
  stopGuidedProgressLoop();
  try {
    if ("mediaSession" in navigator) navigator.mediaSession.setPositionState(null);
  } catch (_) {}
  ambient.fadeOut(0.25).then(() => {
    ambient._stopAll();
  });
  setPlayUi(false);
  if (!opts.skipTimerReset) {
    const min = parseInt(els.timerSelect.value, 10);
    if (min) timerDeadline = Date.now() + min * 60 * 1000;
  }
  saveStorage();
}

function togglePlay() {
  if (playing) pauseCore();
  else playCore();
}

function skipGuided(delta) {
  if (prefersCustomGuided()) {
    guided.currentTime = Math.max(0, guided.currentTime + delta);
    announce(`Guided audio at ${formatMs(guided.currentTime * 1000)}`);
    return;
  }
  if (!shouldSpeak()) {
    toast("Load a file or turn on spoken guidance");
    return;
  }
  speechSynthesis.cancel();
  speechToken++;
  const next = delta < 0 ? Math.max(0, speechChapter - 1) : Math.min(SPEECH_CHAPTERS.length - 1, speechChapter + 1);
  speechChapter = next;
  const t = ++speechToken;
  speakNextChapter(next, t);
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: prefersCustomGuided() ? "Your meditation" : "Midnight Whispers",
      artist: "Sleep Sanctuary",
      album: els.ambientLabel.textContent || "Ambient",
    });
    navigator.mediaSession.setActionHandler("play", () => {
      if (!playing) playCore();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (playing) pauseCore();
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => skipGuided(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => skipGuided(10));
    try {
      navigator.mediaSession.setActionHandler("seekto", null);
    } catch (_) {}
    if (
      prefersCustomGuided() &&
      guided.duration &&
      !Number.isNaN(guided.duration) &&
      guided.duration > 0
    ) {
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime != null && Number.isFinite(d.seekTime)) {
          guided.currentTime = Math.max(0, d.seekTime);
          updateGuidedProgressUi();
          updateMediaSessionPosition();
        }
      });
    }
  } catch (_) {}
}

/** @type {number} */
let guidedProgressRaf = 0;

function startGuidedProgressLoop() {
  stopGuidedProgressLoop();
  const loop = () => {
    if (!playing || !prefersCustomGuided()) {
      guidedProgressRaf = 0;
      return;
    }
    updateGuidedProgressUi();
    updateMediaSessionPosition();
    guidedProgressRaf = requestAnimationFrame(loop);
  };
  guidedProgressRaf = requestAnimationFrame(loop);
}

function stopGuidedProgressLoop() {
  if (guidedProgressRaf) {
    cancelAnimationFrame(guidedProgressRaf);
    guidedProgressRaf = 0;
  }
}

function updateGuidedProgressUi() {
  if (!els.guidedWrap || !prefersCustomGuided()) return;
  const dur = guided.duration;
  const cur = Number.isFinite(guided.currentTime) ? guided.currentTime : 0;
  els.guidedElapsed.textContent = formatTimeSec(cur);
  if (dur && !Number.isNaN(dur) && dur > 0) {
    els.guidedDuration.textContent = formatTimeSec(dur);
    const pct = Math.min(1000, Math.max(0, Math.round((cur / dur) * 1000)));
    els.guidedSeek.value = String(pct);
  } else {
    els.guidedDuration.textContent = "…";
  }
}

/** @param {number} sec */
function formatTimeSec(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateMediaSessionPosition() {
  if (!("mediaSession" in navigator)) return;
  if (!playing || !prefersCustomGuided()) return;
  const d = guided.duration;
  if (!d || Number.isNaN(d) || d <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: d,
      playbackRate: guided.playbackRate,
      position: Math.min(d, Math.max(0, guided.currentTime)),
    });
  } catch (_) {}
}

function bindGuidedSeek() {
  if (!els.guidedSeek) return;
  const applySeek = () => {
    const dur = guided.duration;
    if (!dur || Number.isNaN(dur)) return;
    const v = Number(els.guidedSeek.value) / 1000;
    guided.currentTime = v * dur;
    els.guidedElapsed.textContent = formatTimeSec(guided.currentTime);
    updateMediaSessionPosition();
  };
  els.guidedSeek.addEventListener("input", applySeek);
  els.guidedSeek.addEventListener("change", applySeek);
}

guided.addEventListener("loadedmetadata", () => {
  updateGuidedProgressUi();
  setupMediaSession();
  updateMediaSessionPosition();
});

guided.addEventListener("ended", () => {
  if (!playing) return;
  if (els.loopGuide && els.loopGuide.checked && prefersCustomGuided()) {
    guided.currentTime = 0;
    guided.play().catch(() => toast("Could not loop track"));
    return;
  }
  toast("Guided track finished — ambient continues");
  announce("Guided track finished");
});

function openSettings(open) {
  const panel = els.settingsPanel;
  const back = els.settingsBackdrop;
  const menu = els.menu;
  if (open) {
    panel.classList.remove("opacity-0", "pointer-events-none", "scale-95");
    panel.classList.add("opacity-100", "pointer-events-auto", "scale-100");
    back.classList.remove("opacity-0", "pointer-events-none");
    back.classList.add("opacity-100", "pointer-events-auto");
    menu.setAttribute("aria-expanded", "true");
    els.settingsClose.focus();
  } else {
    panel.classList.add("opacity-0", "pointer-events-none", "scale-95");
    panel.classList.remove("opacity-100", "pointer-events-auto", "scale-100");
    back.classList.add("opacity-0", "pointer-events-none");
    back.classList.remove("opacity-100", "pointer-events-auto");
    menu.setAttribute("aria-expanded", "false");
  }
}

function applyPresetToUi(p) {
  els.ambientLabel.textContent = p.label;
  els.ambientIcon.textContent = p.icon;
}

function buildPresetList(currentId) {
  els.presetList.innerHTML = "";
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className =
      "flex items-center gap-3 w-full rounded-xl px-4 py-3 text-left border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fixed-dim/40 " +
      (p.id === currentId
        ? "border-primary/40 bg-primary/10 text-on-surface-variant"
        : "border-white/10 bg-white/[0.03] text-on-surface-variant/90 hover:bg-white/[0.06]");
    b.innerHTML = `<span class="material-symbols-outlined text-secondary-fixed-dim/80" aria-hidden="true">${p.icon}</span><span class="text-sm font-medium">${p.label}</span>`;
    b.addEventListener("click", async () => {
      applyPresetToUi(p);
      saveStorage();
      if (playing) await ambient.setPreset(p.id);
      toast(`${p.label} selected`);
    });
    els.presetList.appendChild(b);
  }
}

function updateIntensityUi() {
  const v = Number(els.intensity.value);
  els.intensityPct.textContent = `${Math.round(v)}%`;
  ambient.setIntensity(v / 100);
}

function bindCustomGuidedFromFile(file) {
  if (guidedObjectUrl) {
    URL.revokeObjectURL(guidedObjectUrl);
    guidedObjectUrl = null;
  }
  guidedObjectUrl = URL.createObjectURL(file);
  guided.src = guidedObjectUrl;
  els.guidedName.textContent = file.name;
  els.guidedName.classList.remove("hidden");
  els.clearAudio.classList.remove("hidden");
  if (els.guidedWrap) {
    els.guidedWrap.classList.remove("hidden");
    els.guidedWrap.setAttribute("aria-hidden", "false");
  }
  if (els.loopWrap) els.loopWrap.classList.remove("hidden");
  els.sessionSub.textContent = "Using your audio file — ambient continues underneath";
  els.toggleSpeech.disabled = true;
  speechToken++;
  speechSynthesis.cancel();
  if (playing) {
    cancelGuidedVolRamp();
    guided.volume = 0;
    guided
      .play()
      .then(() => rampGuidedVolume(1, 420))
      .catch(() => toast("Could not start file — tap pause then play"));
    updateGuidedProgressUi();
    startGuidedProgressLoop();
    setupMediaSession();
    updateMediaSessionPosition();
  }
}

function clearCustomGuided() {
  if (guidedObjectUrl) URL.revokeObjectURL(guidedObjectUrl);
  guidedObjectUrl = null;
  guided.removeAttribute("src");
  guided.load();
  els.guidedName.classList.add("hidden");
  els.clearAudio.classList.add("hidden");
  if (els.guidedWrap) {
    els.guidedWrap.classList.add("hidden");
    els.guidedWrap.setAttribute("aria-hidden", "true");
  }
  if (els.loopWrap) els.loopWrap.classList.add("hidden");
  if (els.loopGuide) els.loopGuide.checked = false;
  els.toggleSpeech.disabled = false;
  els.sessionSub.textContent = "Beta · spoken guide ~12 min · add your own track anytime";
  stopGuidedProgressLoop();
  try {
    if ("mediaSession" in navigator) navigator.mediaSession.setPositionState(null);
  } catch (_) {}
  if (playing) setupMediaSession();
}

function init() {
  const { preset: storedPreset } = loadStorage();
  const p = PRESETS.find((x) => x.id === storedPreset) || PRESETS[0];
  applyPresetToUi(p);
  buildPresetList(p.id);
  updateIntensityUi();

  els.intensity.addEventListener("input", () => {
    updateIntensityUi();
    localStorage.setItem(STORAGE.intensity, els.intensity.value);
  });

  els.timerSelect.addEventListener("change", () => {
    resetTimerFromSelection();
    saveStorage();
  });

  els.tileTimer.addEventListener("click", () => {
    openSettings(true);
    els.timerSelect.focus();
  });

  els.toggleSpeech.addEventListener("change", () => {
    saveStorage();
    if (!playing) return;
    if (prefersCustomGuided()) return;
    speechSynthesis.cancel();
    speechToken++;
    const t = speechToken;
    if (els.toggleSpeech.checked) speakNextChapter(speechChapter, t);
  });

  els.pickAudio.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    const f = els.fileInput.files?.[0];
    if (!f) return;
    bindCustomGuidedFromFile(f);
    saveStorage();
    toast("Meditation file attached");
  });
  els.clearAudio.addEventListener("click", () => {
    clearCustomGuided();
    els.fileInput.value = "";
    saveStorage();
  });

  if (els.loopGuide) {
    els.loopGuide.addEventListener("change", () => saveStorage());
  }

  bindGuidedSeek();

  els.play.addEventListener("click", togglePlay);
  els.back.addEventListener("click", () => skipGuided(-10));
  els.forward.addEventListener("click", () => skipGuided(10));

  els.menu.addEventListener("click", () => openSettings(true));
  els.settingsClose.addEventListener("click", () => openSettings(false));
  els.settingsBackdrop.addEventListener("click", () => openSettings(false));

  els.closeMain.addEventListener("click", () => {
    pauseCore();
    toast("Session paused");
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,select,textarea")) return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.code === "ArrowLeft") skipGuided(-10);
    else if (e.code === "ArrowRight") skipGuided(10);
    else if (e.code === "Escape") openSettings(false);
  });

  if ("onvoiceschanged" in speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => pickVoice();
  }

  guided.addEventListener("error", () => {
    toast("Could not play that audio file");
    pauseCore();
  });
  guided.addEventListener("ended", () => {
    if (!playing || !prefersCustomGuided()) return;
    toast("Meditation track ended — ambient keeps playing");
    guided.pause();
    guided.currentTime = 0;
  });

  resetTimerFromSelection();
  requestAnimationFrame(tick);
}

init();
