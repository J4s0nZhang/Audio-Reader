import { chunkText, hashString } from "./text.js";

// ---------- small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const wordCount = (t) => (String(t).match(/\S+/g) || []).length;
const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const fmtMB = (b) => (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + " MB";
const fmtMins = (sec) => (sec < 90 ? "about 1 min" : `about ${Math.round(sec / 60)} min`);

let toastTimer;
function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  back15: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  fwd30: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
};

// ---------- voices ----------
const VOICES = [
  ["af_heart", "Heart", "best"],
  ["af_bella", "Bella", "very good"],
  ["af_nicole", "Nicole", "soft"],
  ["bf_emma", "Emma", "British"],
  ["af_aoede", "Aoede", ""],
  ["af_kore", "Kore", ""],
  ["af_sarah", "Sarah", ""],
  ["bf_isabella", "Isabella", "British"],
  ["af_nova", "Nova", ""],
  ["af_alloy", "Alloy", ""],
  ["af_sky", "Sky", ""],
  ["am_michael", "Michael", "male"],
  ["am_fenrir", "Fenrir", "male"],
  ["am_puck", "Puck", "male"],
  ["bm_fable", "Fable", "British male"],
  ["bm_george", "George", "British male"],
];
const voiceName = (id) => (VOICES.find((v) => v[0] === id) || [id, id])[1];
const SPEEDS = [0.85, 0.9, 1, 1.1, 1.2, 1.3];
const RATES = [1, 1.15, 1.25, 1.5, 1.75, 2, 0.85];

// ---------- settings ----------
const memSettings = {};
const settings = {
  get(k, d) {
    try { const v = localStorage.getItem("kr:" + k); return v === null ? d : JSON.parse(v); }
    catch { return k in memSettings ? memSettings[k] : d; }
  },
  set(k, v) {
    try { localStorage.setItem("kr:" + k, JSON.stringify(v)); } catch { memSettings[k] = v; }
  },
};

// ---------- IndexedDB ----------
let dbp;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open("kokoro-reader", 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("docs", { keyPath: "id" });
        const c = d.createObjectStore("chunks", { keyPath: "key" });
        c.createIndex("docId", "docId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => (result = r));
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Storage transaction aborted"));
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const getDoc = (id) => tx("docs", "readonly", (s) => reqP(s.get(id)));
const putDoc = (doc) => tx("docs", "readwrite", (s) => { s.put(doc); });
const allDocs = async () => (await tx("docs", "readonly", (s) => reqP(s.getAll()))).sort((a, b) => b.updatedAt - a.updatedAt);
const putChunk = (rec) => tx("chunks", "readwrite", (s) => { s.put(rec); });
const getChunks = async (docId) =>
  (await tx("chunks", "readonly", (s) => reqP(s.index("docId").getAll(IDBKeyRange.only(docId))))).sort((a, b) => a.i - b.i);
const deleteChunks = (docId) =>
  tx("chunks", "readwrite", (s) => {
    const r = s.index("docId").openKeyCursor(IDBKeyRange.only(docId));
    r.onsuccess = () => { const c = r.result; if (c) { s.delete(c.primaryKey); c.continue(); } };
  });
async function deleteDoc(id) { await deleteChunks(id); await tx("docs", "readwrite", (s) => { s.delete(id); }); }

// ---------- audio encoding ----------
function wavHeader(numSamples, rate) {
  const b = new ArrayBuffer(44), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + numSamples * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, numSamples * 2, true);
  return b;
}
function toInt16(f32, padSamples = 0) {
  const out = new Int16Array(f32.length + padSamples);
  for (let i = 0; i < f32.length; i++) {
    const x = Math.max(-1, Math.min(1, f32[i]));
    out[i] = x < 0 ? x * 32768 : x * 32767;
  }
  return out;
}
const SILENT_URL = URL.createObjectURL(new Blob([wavHeader(2400, 24000), new ArrayBuffer(4800)], { type: "audio/wav" }));

// ---------- the speech engine (web worker) ----------
const model = { status: "idle", engine: null, loaded: 0, total: 0, error: null };
let worker = null;
let loadWaiters = [];
const previewWaiters = new Map();

function currentEngine() { return settings.get("engine", "wasm"); }

function createWorker() {
  if (worker) worker.terminate();
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  model.status = "idle"; model.engine = null;
  worker.onmessage = (e) => onWorkerMessage(e.data);
  worker.onerror = (e) => {
    e.preventDefault?.();
    failEverything("Couldn't start the speech engine. Check your internet connection and reload.");
  };
}

function failEverything(message) {
  model.status = "error"; model.error = message;
  loadWaiters.forEach((w) => w.reject(new Error(message))); loadWaiters = [];
  previewWaiters.forEach((w) => w.reject(new Error(message))); previewWaiters.clear();
  if (job) { job = null; releaseWakeLock(); }
  toast(message, 6000);
  refresh();
}

function ensureModel() {
  const engine = currentEngine();
  if (model.status === "ready" && model.engine === engine) return Promise.resolve();
  return new Promise((resolve, reject) => {
    loadWaiters.push({ resolve, reject });
    if (model.status !== "loading" || model.engine !== engine) {
      model.status = "loading"; model.engine = engine; model.loaded = 0; model.total = 0; model.error = null;
      worker.postMessage({ type: "load", engine });
      refresh();
    }
  });
}

function onWorkerMessage(m) {
  switch (m.type) {
    case "load-progress":
      model.loaded = m.loaded; model.total = m.total;
      updateLive();
      break;
    case "loaded":
      model.status = "ready"; model.engine = m.engine;
      loadWaiters.forEach((w) => w.resolve()); loadWaiters = [];
      refresh();
      break;
    case "preview": {
      const w = previewWaiters.get(m.id);
      previewWaiters.delete(m.id);
      w?.resolve(m);
      break;
    }
    case "chunk": onChunk(m); break;
    case "done": onJobDone(m); break;
    case "error": onWorkerError(m); break;
  }
}

function onWorkerError(m) {
  console.error("Speech engine error: " + JSON.stringify(m));
  if (m.engine === "webgpu" && model.status !== "ready") {
    settings.set("engine", "wasm");
    createWorker();
    failEverything("Fast mode (WebGPU) didn't work on this device, so I switched to Standard. Tap again to retry.");
    return;
  }
  if (m.during === "preview") {
    const w = previewWaiters.get(m.id); previewWaiters.delete(m.id); w?.reject(new Error(m.message));
    return;
  }
  if (m.during === "load") { failEverything("Couldn't load the voice model: " + m.message); return; }
  if (job && (m.jobId === job.jobId || m.during === "generate")) {
    job = null; releaseWakeLock();
    toast("Audio generation stopped: " + m.message, 6000);
    refresh();
  }
}

// ---------- generation ----------
let job = null; // { jobId, docId, genMs, audioSec, charsDone, charsTotal }
let writeQueue = Promise.resolve();
const genKey = (doc) => [hashString(doc.text), doc.markdown ? 1 : 0, doc.voice, doc.speed].join("|");
const audioIsCurrent = (doc) => !!doc.gen && doc.gen.key === genKey(doc);

async function startGeneration(docId, { restart = false } = {}) {
  if (job) { toast("Already making audio for another document. Stop it first."); return; }
  let doc = await getDoc(docId);
  if (!doc) return;
  if (restart || !audioIsCurrent(doc)) {
    const chunks = chunkText(doc.text, { markdown: doc.markdown });
    if (!chunks.length) { toast("There's no text to read."); return; }
    if (playerState.docId === doc.id) unloadPlayer();
    await deleteChunks(doc.id);
    doc.chunks = chunks;
    doc.gen = { key: genKey(doc), done: 0, total: chunks.length, samples: 0, rate: 24000 };
    doc.position = 0;
    await putDoc(doc);
  }
  if (doc.gen.done >= doc.gen.total) { refresh(); return; }
  const remaining = doc.chunks.slice(doc.gen.done);
  job = {
    jobId: Date.now(), docId: doc.id, genMs: 0, audioSec: 0, charsDone: 0,
    charsTotal: remaining.reduce((n, c) => n + c.text.length, 0),
  };
  acquireWakeLock();
  refresh();
  ensureModel().catch(() => {}); // for the download progress display
  worker.postMessage({
    type: "generate", jobId: job.jobId, engine: currentEngine(), voice: doc.voice, speed: doc.speed,
    chunks: remaining.map((c, k) => ({ i: doc.gen.done + k, text: c.text })),
  });
}

function stopGeneration() {
  if (!job) return;
  worker.postMessage({ type: "cancel", jobId: job.jobId });
  job = null;
  releaseWakeLock();
  refresh();
}

function onChunk(m) {
  writeQueue = writeQueue.then(async () => {
    if (!job || m.jobId !== job.jobId) return;
    const doc = await getDoc(job.docId);
    if (!doc || !doc.gen) return;
    const c = doc.chunks[m.i];
    const pcm = toInt16(m.samples, Math.round(m.rate * (c?.pauseAfter || 0)));
    await putChunk({ key: doc.id + ":" + m.i, docId: doc.id, i: m.i, pcm: pcm.buffer, samples: pcm.length });
    doc.gen.done = m.i + 1;
    doc.gen.samples += pcm.length;
    doc.gen.rate = m.rate;
    await putDoc(doc);
    if (job && job.jobId === m.jobId) {
      job.genMs += m.ms;
      job.audioSec += m.samples.length / m.rate;
      job.charsDone += c ? c.text.length : 0;
      if (m.skipped) job.skipped = (job.skipped || 0) + 1;
    }
    if (model.status !== "ready") { model.status = "ready"; model.engine = currentEngine(); }
    if (playerState.waiting && playerState.docId === doc.id) resumeAfterWait(doc);
    updateLive(doc);
  }).catch((err) => {
    console.error(err);
    if (job) { worker.postMessage({ type: "cancel", jobId: job.jobId }); job = null; releaseWakeLock(); }
    toast("Couldn't save audio. Your phone may be low on storage.", 6000);
    refresh();
  });
}

function onJobDone(m) {
  writeQueue = writeQueue.then(async () => {
    if (!job || m.jobId !== job.jobId) return;
    const doc = await getDoc(job.docId);
    const skipped = job.skipped || 0;
    job = null;
    releaseWakeLock();
    if (doc && doc.gen && doc.gen.done >= doc.gen.total) {
      toast(`“${doc.title}” is ready to listen.` + (skipped ? ` ${skipped} short part${skipped > 1 ? "s" : ""} couldn't be read and ${skipped > 1 ? "were" : "was"} skipped.` : ""), skipped ? 6000 : 3200);
    }
    refresh();
  });
}

let wakeLock = null;
async function acquireWakeLock() {
  try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch {}
}
function releaseWakeLock() { try { wakeLock?.release(); } catch {} wakeLock = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && job) acquireWakeLock(); });

// ---------- player ----------
const player = $("#player");
const previewPlayer = $("#previewPlayer");
let playerState = { docId: null, url: null, samples: 0, rate: 24000, blob: null, waiting: false };
let lastSave = 0;
let loadingSrc = false; // true while swapping sources, so we don't save a bogus position

function unloadPlayer() {
  player.pause();
  if (playerState.url) URL.revokeObjectURL(playerState.url);
  playerState = { docId: null, url: null, samples: 0, rate: 24000, blob: null, waiting: false };
  player.removeAttribute("src");
  player.load();
}

function waitFor(el, event, ms = 8000) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); el.removeEventListener(event, done); resolve(); };
    const t = setTimeout(done, ms);
    el.addEventListener(event, done, { once: true });
  });
}

/** Build one WAV from every finished chunk and point the player at it. */
async function loadPlayer(doc, startAt = 0) {
  const chunks = await getChunks(doc.id);
  const parts = [];
  let samples = 0;
  for (let k = 0; k < chunks.length && chunks[k].i === k; k++) { parts.push(chunks[k].pcm); samples += chunks[k].samples; }
  if (!samples) return false;
  const rate = doc.gen?.rate || 24000;
  const blob = new Blob([wavHeader(samples, rate), ...parts], { type: "audio/wav" });
  if (playerState.url) URL.revokeObjectURL(playerState.url);
  const url = URL.createObjectURL(blob);
  playerState = { docId: doc.id, url, samples, rate, blob, waiting: false };
  loadingSrc = true;
  try {
    player.src = url;
    player.load();
    await waitFor(player, "loadedmetadata");
    player.playbackRate = player.defaultPlaybackRate = settings.get("rate", 1);
    const dur = samples / rate;
    if (startAt > 0 && startAt < dur - 1) player.currentTime = startAt;
  } finally {
    loadingSrc = false;
  }
  return true;
}

async function playDoc(docId) {
  const isLoaded = playerState.docId === docId && playerState.url;
  if (isLoaded && !playerState.waiting) {
    const doc = await peekDoc(docId);
    // If more audio was made since we loaded, rebuild first (keeps position).
    if (doc && doc.gen && doc.gen.samples > playerState.samples && player.paused) {
      const t = player.currentTime;
      player.src = SILENT_URL; player.play().catch(() => {}); // keep iOS's permission to play
      await loadPlayer(doc, t);
    }
    player.play().catch((e) => toast("Couldn't start playback: " + e.message));
    return;
  }
  // Unlock the element during the tap, then load the real audio.
  player.src = SILENT_URL;
  player.play().catch(() => {});
  const doc = await getDoc(docId);
  if (!doc || !(await loadPlayer(doc, doc.position || 0))) { toast("No audio yet."); return; }
  player.play().catch((e) => toast("Couldn't start playback: " + e.message));
}

// Cache of the last-read doc so the play button can act within the tap.
const docCache = new Map();
async function peekDoc(id) { const d = await getDoc(id); if (d) docCache.set(id, d); return d; }

async function resumeAfterWait(doc) {
  const t = playerState.samples / playerState.rate;
  await loadPlayer(doc, t);
  player.play().catch(() => {});
}

player.addEventListener("ended", async () => {
  const doc = playerState.docId && (await getDoc(playerState.docId));
  if (!doc) return;
  if (doc.gen && doc.gen.samples > playerState.samples) {
    await resumeAfterWait(doc);
  } else if (job && job.docId === doc.id) {
    playerState.waiting = true;
    toast("You've caught up. It'll keep playing as soon as more audio is ready.");
    updateLive(doc);
  } else {
    doc.position = 0; await putDoc(doc);
    updateLive(doc);
  }
});
player.addEventListener("timeupdate", () => {
  updatePlayerUI();
  const now = Date.now();
  if (now - lastSave > 5000 && playerState.docId && !player.paused && !loadingSrc && player.src !== SILENT_URL) {
    lastSave = now;
    const id = playerState.docId, pos = player.currentTime;
    getDoc(id).then((d) => { if (d) { d.position = pos; return putDoc(d); } }).catch(() => {});
  }
});
["play", "pause"].forEach((ev) => player.addEventListener(ev, () => {
  updatePlayerUI();
  if (ev === "play") setMediaSession();
  if (ev === "pause" && playerState.docId) {
    const id = playerState.docId, pos = player.currentTime;
    if (loadingSrc || player.src === SILENT_URL) return;
    getDoc(id).then((d) => { if (d) { d.position = pos; return putDoc(d); } }).catch(() => {});
  }
}));

function seekBy(delta) {
  if (!playerState.url) return;
  const max = playerState.samples / playerState.rate;
  player.currentTime = Math.max(0, Math.min(max - 0.2, player.currentTime + delta));
}

async function setMediaSession() {
  if (!("mediaSession" in navigator) || !playerState.docId) return;
  const doc = await getDoc(playerState.docId);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: doc?.title || "Reader",
      artist: "Kokoro Reader · " + voiceName(doc?.voice),
      artwork: [{ src: new URL("icons/icon-512.png", location.href).href, sizes: "512x512", type: "image/png" }],
    });
    navigator.mediaSession.setActionHandler("play", () => player.play());
    navigator.mediaSession.setActionHandler("pause", () => player.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => seekBy(-15));
    navigator.mediaSession.setActionHandler("seekforward", () => seekBy(30));
    navigator.mediaSession.setActionHandler("seekto", (d) => { if (d.seekTime != null) player.currentTime = d.seekTime; });
  } catch {}
}

async function preview(voice, speed) {
  previewPlayer.src = SILENT_URL;
  previewPlayer.play().catch(() => {});
  const btn = $("#previewBtn");
  if (btn) { btn.disabled = true; btn.textContent = model.status === "ready" ? "Making sample…" : "Loading voices…"; }
  try {
    const id = uid();
    const p = new Promise((resolve, reject) => previewWaiters.set(id, { resolve, reject }));
    ensureModel().catch(() => {});
    worker.postMessage({ type: "preview", id, voice, speed, engine: currentEngine(),
      text: `Hi, I'm ${voiceName(voice)}. I'll read your documents to you, so you can listen on the go.` });
    const m = await p;
    const pcm = toInt16(m.samples);
    previewPlayer.src = URL.createObjectURL(new Blob([wavHeader(pcm.length, m.rate), pcm.buffer], { type: "audio/wav" }));
    if (!player.paused) player.pause();
    await previewPlayer.play();
  } catch (e) {
    toast("Couldn't play the sample: " + e.message);
  } finally {
    const b = $("#previewBtn");
    if (b) { b.disabled = false; b.innerHTML = ICON.speaker + " Sample"; }
  }
}

function shareAudio(doc) {
  if (playerState.docId !== doc.id || !playerState.blob) { toast("Open the player first, then try again."); return; }
  const name = (doc.title || "audio").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) || "audio";
  const file = new File([playerState.blob], name + ".wav", { type: "audio/wav" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: doc.title }).catch(() => {});
  } else {
    const a = document.createElement("a");
    a.href = playerState.url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
}

// ---------- views ----------
function header(title, left = "", right = "") {
  return `<header class="bar"><div class="left">${left}</div><h1>${esc(title)}</h1><div class="right">${right}</div></header>`;
}

function statusPill(doc) {
  if (job && job.docId === doc.id) return `<span class="pill busy">Making audio</span>`;
  if (!doc.gen || !doc.gen.samples) return `<span class="pill">No audio yet</span>`;
  if (!audioIsCurrent(doc)) return `<span class="pill">Out of date</span>`;
  if (doc.gen.done < doc.gen.total) return `<span class="pill busy">${Math.floor((100 * doc.gen.done) / doc.gen.total)}%</span>`;
  return `<span class="pill ready">${fmtTime(doc.gen.samples / doc.gen.rate)}</span>`;
}

async function viewLibrary() {
  const docs = await allDocs();
  const right = `<button class="navbtn" data-go="#/settings" aria-label="Settings">${ICON.gear}</button>
                 <button class="navbtn" data-go="#/new" aria-label="New">${ICON.plus}</button>`;
  const list = docs.length
    ? `<div class="card" style="padding:4px 12px"><ul class="doclist">${docs.map((d) => {
        const w = wordCount(d.text);
        return `<li><button data-go="#/doc/${d.id}">
          <div class="grow"><div class="t">${esc(d.title)}</div>
          <div class="m">${w.toLocaleString()} words · ${fmtMins((w / 155) * 60)}</div></div>
          ${statusPill(d)}${ICON.chev}</button></li>`;
      }).join("")}</ul></div>`
    : `<div class="card empty">${ICON.doc}<h2 style="margin:10px 0 6px">Nothing here yet</h2>
        <p class="muted" style="margin:0 0 16px">Paste text or import a .txt or .md file, and it'll be read aloud with a natural voice. Everything stays on your phone.</p>
        <button class="btn primary" data-go="#/new">${ICON.plus} Add text</button></div>`;
  app.innerHTML = header("", "", right) + `<div class="wrap"><div class="big-title">Reader</div>${list}
    <p class="muted tiny" style="text-align:center">Voices by Kokoro, running on your device.</p></div>`;
}

async function viewEditor(id) {
  const existing = id ? await getDoc(id) : null;
  const doc = existing || { title: "", text: "", markdown: true };
  app.innerHTML = header(existing ? "Edit" : "New",
    `<button class="navbtn" data-back>Cancel</button>`,
    `<button class="navbtn" id="saveBtn" style="font-weight:600">Save</button>`) +
    `<div class="wrap stack" style="margin-top:8px">
      <div><label class="field" for="title">Title</label>
        <input type="text" id="title" placeholder="e.g. Auth module overview" value="${esc(doc.title)}" autocomplete="off"></div>
      <div class="row wrapok">
        <button class="btn ghost" id="importBtn">Import file…</button>
        <button class="btn ghost" id="pasteBtn">Paste</button>
        <input type="file" id="fileInput" accept=".txt,.md,.markdown,.text,text/plain,text/markdown" multiple class="hidden">
      </div>
      <div><label class="field" for="text">Text</label>
        <textarea id="text" placeholder="Paste or type the text you want to hear…">${esc(doc.text)}</textarea>
        <div class="muted small" id="count" style="margin-top:6px"></div></div>
      <label class="check"><input type="checkbox" id="md" ${doc.markdown ? "checked" : ""}>
        <span>Clean up Markdown <span class="muted small">(skip code blocks, links and symbols)</span></span></label>
      ${existing && existing.gen && existing.gen.samples ? `<div class="warn">Changing the text means the audio will need to be made again.</div>` : ""}
    </div>`;

  const ta = $("#text"), title = $("#title"), count = $("#count");
  const upd = () => { const w = wordCount(ta.value); count.textContent = w ? `${w.toLocaleString()} words · ${fmtMins((w / 155) * 60)} to listen` : ""; };
  ta.addEventListener("input", upd); upd();

  $("#pasteBtn").onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t) return toast("Clipboard is empty.");
      ta.value = ta.value ? ta.value + "\n\n" + t : t; upd();
    } catch { toast("Paste was blocked. Long-press in the text box and choose Paste instead."); }
  };
  $("#importBtn").onclick = () => $("#fileInput").click();
  $("#fileInput").onchange = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    if (files.length === 1 || existing) {
      const f = files[0];
      ta.value = await f.text(); upd();
      if (!title.value.trim()) title.value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      $("#md").checked = !/\.txt$/i.test(f.name) || $("#md").checked;
    } else {
      for (const f of files) await saveNewDoc(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), await f.text(), !/\.txt$/i.test(f.name));
      toast(`Imported ${files.length} files.`);
      location.hash = "#/";
    }
  };
  $("#saveBtn").onclick = async () => {
    const text = ta.value.trim();
    if (!text) return toast("Add some text first.");
    const t = title.value.trim() || text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60) || "Untitled";
    if (existing) {
      const d = await getDoc(existing.id);
      Object.assign(d, { title: t, text, markdown: $("#md").checked, updatedAt: Date.now() });
      await putDoc(d);
      location.replace("#/doc/" + d.id);
    } else {
      const d = await saveNewDoc(t, text, $("#md").checked);
      location.replace("#/doc/" + d.id);
    }
  };
}

async function saveNewDoc(title, text, markdown) {
  const d = {
    id: uid(), title, text, markdown, voice: settings.get("voice", "af_heart"), speed: settings.get("speed", 1),
    createdAt: Date.now(), updatedAt: Date.now(), gen: null, chunks: [], position: 0,
  };
  await putDoc(d);
  try { navigator.storage?.persist?.(); } catch {}
  return d;
}

async function viewDoc(id) {
  const doc = await peekDoc(id);
  if (!doc) { location.replace("#/"); return; }
  const w = wordCount(doc.text);
  app.innerHTML = header("",
    `<button class="navbtn" data-go="#/">${ICON.back} Library</button>`,
    `<button class="navbtn" data-go="#/edit/${doc.id}">Edit</button>`) +
    `<div class="wrap">
      <div class="big-title" style="font-size:26px;margin-bottom:4px">${esc(doc.title)}</div>
      <div class="muted small" style="margin-bottom:14px">${w.toLocaleString()} words · ${fmtMins((w / 155) * 60)}</div>
      <div class="card stack">
        <div><label class="field" for="voice">Voice</label>
          <div class="row"><select id="voice">${VOICES.map((v) => `<option value="${v[0]}" ${v[0] === doc.voice ? "selected" : ""}>${v[1]}${v[2] ? " · " + v[2] : ""}</option>`).join("")}</select>
          <button class="btn" id="previewBtn" style="flex:none">${ICON.speaker} Sample</button></div></div>
        <div><label class="field" for="speed">Reading speed</label>
          <select id="speed">${SPEEDS.map((s) => `<option value="${s}" ${s === doc.speed ? "selected" : ""}>${s === 1 ? "Normal" : s + "×"}</option>`).join("")}</select></div>
      </div>
      <div class="card" id="gencard"></div>
      <div class="card player hidden" id="playercard">
        <input type="range" id="scrub" min="0" max="1" step="0.1" value="0" aria-label="Position">
        <div class="time"><span id="tcur">0:00</span><span id="tdur">0:00</span></div>
        <div class="controls">
          <button class="roundbtn" id="b15" aria-label="Back 15 seconds">${ICON.back15}<span class="lbl">15</span></button>
          <button class="roundbtn playbtn" id="playBtn" aria-label="Play">${ICON.play}</button>
          <button class="roundbtn" id="f30" aria-label="Forward 30 seconds">${ICON.fwd30}<span class="lbl">30</span></button>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="rate" id="rateBtn">${settings.get("rate", 1)}×</button>
          <span class="muted tiny" id="waitNote"></span>
          <span class="spacer"></span>
          <button class="navbtn" id="shareBtn">${ICON.share} Save audio</button>
        </div>
      </div>
      <details class="card"><summary>Text</summary>
        <div class="textpreview" style="margin-top:10px">${esc(doc.text.slice(0, 20000))}${doc.text.length > 20000 ? "…" : ""}</div></details>
      <button class="btn danger block" id="delBtn">Delete</button>
    </div>`;

  const saveField = async (patch) => {
    const d = await getDoc(id); Object.assign(d, patch); await putDoc(d); docCache.set(id, d);
    updateLive(d);
  };
  $("#voice").onchange = (e) => { settings.set("voice", e.target.value); saveField({ voice: e.target.value }); };
  $("#speed").onchange = (e) => { settings.set("speed", +e.target.value); saveField({ speed: +e.target.value }); };
  $("#previewBtn").onclick = () => preview($("#voice").value, +$("#speed").value);
  $("#playBtn").onclick = () => {
    if (playerState.docId === id && !player.paused) player.pause();
    else playDoc(id);
  };
  $("#b15").onclick = () => seekBy(-15);
  $("#f30").onclick = () => seekBy(30);
  $("#rateBtn").onclick = (e) => {
    const r = RATES[(RATES.indexOf(settings.get("rate", 1)) + 1) % RATES.length];
    settings.set("rate", r);
    player.playbackRate = player.defaultPlaybackRate = r;
    e.currentTarget.textContent = r + "×";
  };
  const scrub = $("#scrub");
  scrub.addEventListener("input", () => {
    if (playerState.docId !== id) return;
    player.currentTime = Math.min(+scrub.value, playerState.samples / playerState.rate - 0.2);
  });
  $("#shareBtn").onclick = async () => shareAudio(docCache.get(id) || (await getDoc(id)));
  $("#delBtn").onclick = async () => {
    if (!confirm(`Delete “${doc.title}” and its audio?`)) return;
    if (job && job.docId === id) stopGeneration();
    if (playerState.docId === id) unloadPlayer();
    await deleteDoc(id);
    location.replace("#/");
  };

  updateLive(doc);
  // Have the audio ready so Play works instantly (unless something else is playing).
  if (doc.gen && doc.gen.samples && playerState.docId !== id && (player.paused || !playerState.docId)) {
    await loadPlayer(doc, doc.position || 0);
    updatePlayerUI();
  }
}

function genCardHTML(doc) {
  const g = doc.gen;
  const current = audioIsCurrent(doc);
  const running = job && job.docId === doc.id;
  const pct = g && current ? (100 * g.done) / g.total : 0;
  if (running) {
    let line;
    if (job.charsDone === 0 && model.status === "loading" && model.total > 0 && model.loaded < model.total) {
      line = `Downloading the voice model: ${fmtMB(model.loaded)} of ${fmtMB(model.total)} (first time only)`;
    } else if (job.charsDone === 0) {
      line = model.status === "loading" ? "Loading the voice model…" : "Starting…";
    } else {
      const leftSec = ((job.charsTotal - job.charsDone) * (job.genMs / job.charsDone)) / 1000;
      line = `Part ${g.done} of ${g.total} · ${leftSec < 60 ? "under a minute" : "about " + Math.ceil(leftSec / 60) + " min"} left`;
    }
    return `<div class="stack"><div class="row"><strong>Making audio</strong><span class="spacer"></span><span class="muted small">${Math.floor(pct)}%</span></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="muted small">${esc(line)}</div>
      <div class="muted tiny">Keep this screen open while it works. You can start listening now; playback continues as more is ready.</div>
      <button class="btn ghost block" id="stopBtn">Stop</button></div>`;
  }
  if (g && current && g.done >= g.total) {
    return `<div class="row"><strong>Audio ready</strong><span class="spacer"></span><span class="muted small">${fmtTime(g.samples / g.rate)} · ${esc(voiceName(doc.voice))}</span></div>`;
  }
  if (g && current && g.done > 0) {
    return `<div class="stack"><div class="row"><strong>Partly made</strong><span class="spacer"></span><span class="muted small">${Math.floor(pct)}%</span></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="row"><button class="btn primary" style="flex:1" id="genBtn">Continue</button>
      <button class="btn ghost" id="restartBtn">Start over</button></div></div>`;
  }
  const stale = g && g.samples && !current;
  return `<div class="stack">
    ${stale ? `<div class="warn">The text, voice or speed changed since this audio was made. You can still play the old version, or make it again.</div>` : ""}
    <button class="btn primary block" id="genBtn">${stale ? "Make audio again" : "Make audio"}</button>
    <div class="muted tiny">${model.status === "ready" ? "Runs on your phone." : "The first time, this downloads the voice model (about 90 MB). After that it works offline."}</div></div>`;
}

function updateLive(doc) {
  const route = parseRoute();
  if (route.name === "library") { viewLibrary(); return; }
  if (route.name !== "doc") return;
  const id = route.id;
  if (doc && doc.id !== id) return;
  const render = (d) => {
    const card = $("#gencard");
    if (!card || !d) return;
    card.innerHTML = genCardHTML(d);
    $("#genBtn") && ($("#genBtn").onclick = () => startGeneration(id));
    $("#restartBtn") && ($("#restartBtn").onclick = () => startGeneration(id, { restart: true }));
    $("#stopBtn") && ($("#stopBtn").onclick = () => stopGeneration());
    $("#playercard")?.classList.toggle("hidden", !(d.gen && d.gen.samples));
    docCache.set(id, d);
    updatePlayerUI();
  };
  if (doc) render(doc); else getDoc(id).then(render);
}

function updatePlayerUI() {
  const route = parseRoute();
  if (route.name !== "doc") return;
  const d = docCache.get(route.id);
  const pb = $("#playBtn");
  if (!pb || !d) return;
  const mine = playerState.docId === route.id;
  const playing = mine && !player.paused && player.src !== SILENT_URL;
  pb.innerHTML = playing ? ICON.pause : ICON.play;
  pb.setAttribute("aria-label", playing ? "Pause" : "Play");
  const total = d.gen ? d.gen.samples / (d.gen.rate || 24000) : 0;
  const cur = mine ? player.currentTime : d.position || 0;
  const scrub = $("#scrub");
  scrub.max = Math.max(1, total);
  if (document.activeElement !== scrub) scrub.value = Math.min(cur, total);
  $("#tcur").textContent = fmtTime(cur);
  const making = job && job.docId === d.id;
  $("#tdur").textContent = fmtTime(total) + (making ? " so far" : "");
  $("#waitNote").textContent = mine && playerState.waiting ? "Waiting for more audio…" : "";
}

async function viewSettings() {
  const engine = currentEngine();
  const hasGPU = "gpu" in navigator;
  let usage = "";
  try { const est = await navigator.storage.estimate(); usage = `Using ${fmtMB(est.usage || 0)} on this device.`; } catch {}
  let persisted = false;
  try { persisted = await navigator.storage.persisted(); } catch {}
  app.innerHTML = header("Settings", `<button class="navbtn" data-go="#/">${ICON.back} Library</button>`) +
    `<div class="wrap" style="margin-top:8px">
      <div class="card stack">
        <strong>Speech engine</strong>
        <div class="seg">
          <label><input type="radio" name="engine" value="wasm" ${engine === "wasm" ? "checked" : ""}>
            <div><div>Standard</div><div class="muted small">Works on any recent iPhone. Downloads about 90 MB once.</div></div></label>
          <label><input type="radio" name="engine" value="webgpu" ${engine === "webgpu" ? "checked" : ""} ${hasGPU ? "" : "disabled"}>
            <div><div>Fast (WebGPU)</div><div class="muted small">${hasGPU ? "Uses the graphics chip, often several times faster. Downloads about 330 MB once and uses more memory." : "Not available in this browser."}</div></div></label>
        </div>
        <div class="muted small">Engine status: ${esc(model.status === "ready" ? "loaded" : model.status === "loading" ? "loading…" : model.status === "error" ? "error" : "not loaded yet")}</div>
      </div>
      <div class="card stack">
        <strong>Storage</strong>
        <div class="muted small">${esc(usage)} ${persisted ? "Storage is protected from automatic cleanup." : ""}</div>
        <button class="btn ghost block" id="clearAudio">Delete all generated audio</button>
        <button class="btn ghost block" id="clearModel">Delete the downloaded voice model</button>
      </div>
      <div class="card stack small">
        <strong>Tips</strong>
        <div class="muted">Add this page to your Home Screen (Share → Add to Home Screen) to use it like an app. The Home Screen app keeps its own library, separate from Safari.</div>
        <div class="muted">Audio plays with the screen locked, and lock-screen controls work. Making audio needs the screen on.</div>
      </div>
    </div>`;
  document.querySelectorAll('input[name="engine"]').forEach((r) => (r.onchange = () => {
    if (job) { toast("Stop the current audio job first."); r.checked = false; $(`input[value="${engine}"]`).checked = true; return; }
    settings.set("engine", r.value);
    createWorker();
    toast(r.value === "webgpu" ? "Fast mode on. The next audio job loads it." : "Standard mode on.");
  }));
  $("#clearAudio").onclick = async () => {
    if (!confirm("Delete the audio for every document? Your text stays.")) return;
    if (job) stopGeneration();
    unloadPlayer();
    for (const d of await allDocs()) { await deleteChunks(d.id); d.gen = null; d.position = 0; await putDoc(d); }
    toast("Audio deleted."); viewSettings();
  };
  $("#clearModel").onclick = async () => {
    if (!confirm("Delete the downloaded voice model? It will download again next time.")) return;
    if (job) stopGeneration();
    try { for (const k of await caches.keys()) if (/transformers|kokoro/i.test(k)) await caches.delete(k); } catch {}
    createWorker();
    toast("Voice model deleted."); viewSettings();
  };
}

// ---------- routing ----------
function parseRoute() {
  const h = location.hash || "#/";
  let m;
  if ((m = h.match(/^#\/doc\/(.+)$/))) return { name: "doc", id: decodeURIComponent(m[1]) };
  if ((m = h.match(/^#\/edit\/(.+)$/))) return { name: "edit", id: decodeURIComponent(m[1]) };
  if (h === "#/new") return { name: "new" };
  if (h === "#/settings") return { name: "settings" };
  return { name: "library" };
}
async function refresh() {
  const r = parseRoute();
  if (r.name === "doc") {
    if ($("#gencard")) updateLive(); else await viewDoc(r.id);
  } else if (r.name === "library") await viewLibrary();
  else if (r.name === "settings") await viewSettings();
}
async function route() {
  const r = parseRoute();
  window.scrollTo(0, 0);
  if (r.name === "doc") await viewDoc(r.id);
  else if (r.name === "edit") await viewEditor(r.id);
  else if (r.name === "new") await viewEditor(null);
  else if (r.name === "settings") await viewSettings();
  else await viewLibrary();
}
window.addEventListener("hashchange", route);
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); location.hash = go.dataset.go; return; }
  if (e.target.closest("[data-back]")) { e.preventDefault(); history.length > 1 ? history.back() : (location.hash = "#/"); }
});
window.addEventListener("beforeunload", (e) => { if (job) { e.preventDefault(); e.returnValue = ""; } });

// ---------- start ----------
const WELCOME = `# Welcome to Reader

This app reads your text out loud with a natural voice, and it runs entirely on your phone. Nothing you paste here is sent anywhere.

## How to use it

Tap the plus button in the library to paste text or import a text or Markdown file. Open a document, pick a voice, and tap Make audio. The first time, the app downloads the voice model, which is about ninety megabytes. After that, it works offline.

You can start listening as soon as the first part is ready. Once the audio is made, it keeps playing with your screen locked, and you can use the lock screen controls to pause or skip.

## Tips

Markdown is cleaned up automatically, so headings, links and code blocks won't be read as symbols. If you want to keep a copy of the audio, tap Save audio to put it in the Files app.`;

async function start() {
  createWorker();
  if (!settings.get("seeded", false)) {
    settings.set("seeded", true);
    if (!(await allDocs()).length) await saveNewDoc("Welcome to Reader", WELCOME, true);
  }
  await route();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
start().catch((e) => {
  console.error(e);
  app.innerHTML = `<div class="wrap"><div class="card" style="margin-top:20px"><strong>Something went wrong.</strong><p class="muted">${esc(e.message)}</p>
    <p class="muted small">If you're in a Private Browsing tab, open the page in a normal tab. Storage isn't available in private mode.</p></div></div>`;
});

// Exposed for testing in the browser console.
window.__reader = { chunkText, getDoc, allDocs, getChunks, model, get job() { return job; }, get playerState() { return playerState; } };
