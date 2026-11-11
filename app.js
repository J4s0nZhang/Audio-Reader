import { buildChapters, bookTitle, toParagraphs, makeChunks } from "./text.js";
import { AudiobookWriter } from "./audiobook.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const words = (t) => (String(t).match(/\S+/g) || []).length;
const fmtDur = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const fmtMins = (sec) => (sec < 60 ? "under a minute" : sec < 5400 ? `about ${Math.round(sec / 60)} min` : `about ${(sec / 3600).toFixed(1)} hours`);
const fmtMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + " MB";
const pref = {
  get(k, d) { try { const v = localStorage.getItem("abm:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("abm:" + k, JSON.stringify(v)); } catch {} },
};

// ---------- voices ----------
const VOICES = [
  ["Recommended", [["af_heart", "Heart · American female · A"], ["af_bella", "Bella · American female · A-"], ["af_nicole", "Nicole · American female, soft · B-"], ["bf_emma", "Emma · British female · B-"]]],
  ["More female voices", [["af_aoede", "Aoede · American · C+"], ["af_kore", "Kore · American · C+"], ["af_sarah", "Sarah · American · C+"], ["af_nova", "Nova · American · C"], ["af_alloy", "Alloy · American · C"], ["bf_isabella", "Isabella · British · C"], ["af_sky", "Sky · American · C-"]]],
  ["Male voices", [["am_michael", "Michael · American · C+"], ["am_fenrir", "Fenrir · American · C+"], ["am_puck", "Puck · American · C+"], ["bm_george", "George · British · C"], ["bm_fable", "Fable · British · C"]]],
];
const voiceName = (id) => (VOICES.flatMap((g) => g[1]).find((v) => v[0] === id)?.[1] || id).split(" · ")[0];
$("#voice").innerHTML = VOICES.map(([g, vs]) => `<optgroup label="${g}">${vs.map(([id, n]) => `<option value="${id}">${n}</option>`).join("")}</optgroup>`).join("");
$("#voice").value = pref.get("voice", "af_heart");
$("#speed").value = String(pref.get("speed", 1));
$("#announce").checked = pref.get("announce", true);
$("#engine").value = pref.get("engine", "auto");
$("#author").value = pref.get("author", "");
for (const id of ["voice", "speed", "engine"]) $("#" + id).onchange = (e) => { pref.set(id, e.target.value); if (id === "engine") resetPool(); updateEstimate(); };
$("#speed").onchange = (e) => { pref.set("speed", +e.target.value); updateEstimate(); };
$("#announce").onchange = (e) => { pref.set("announce", e.target.checked); renderChapters(); };
$("#author").oninput = (e) => pref.set("author", e.target.value);

// ---------- input ----------
let docs = []; // { id, name, text } for text/Markdown input
let book = null; // a PDF novel: { fileName, title, author, cover, skipped, stats }
let chapters = []; // { title, text } for documents, or { title, label, heading, paragraphs, pages } for a PDF
let nextId = 1;
const TEXT_FILE = /\.(md|markdown|txt|text)$/i;
const PDF_FILE = /\.pdf$/i;
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

async function addFiles(fileList) {
  const all = [...fileList];
  const pdfs = all.filter((f) => PDF_FILE.test(f.name) || f.type === "application/pdf");
  if (pdfs.length) {
    if (pdfs.length > 1 || all.length > pdfs.length) showError("A PDF book is made into its own audiobook, so only the first PDF was added.");
    else showError("");
    return addPdf(pdfs[0]);
  }
  const files = all.filter((f) => TEXT_FILE.test(f.name) || f.type.startsWith("text/"));
  const skipped = all.length - files.length;
  files.sort((a, b) => natural(a.webkitRelativePath || a.relPath || a.name, b.webkitRelativePath || b.relPath || b.name));
  if (book && files.length) { book = null; titleEdited = false; }
  for (const f of files) docs.push({ id: nextId++, name: f.name, path: f.webkitRelativePath || f.relPath || f.name, text: await f.text() });
  if (skipped > 0) showError(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} that ${skipped > 1 ? "aren't" : "isn't"} .md, .txt or .pdf.`);
  else showError("");
  docsChanged();
}

async function addPdf(file) {
  if (run) return showError("Wait for the current audiobook to finish first.");
  const status = $("#pdfStatus");
  status.classList.remove("hidden");
  status.textContent = `Opening ${file.name}…`;
  try {
    const { analyzePdf } = await import("./pdfbook.js");
    const r = await analyzePdf(new Uint8Array(await file.arrayBuffer()), (frac, msg) => { status.textContent = `${msg}…`; });
    docs = [];
    book = { fileName: file.name, title: r.title || file.name.replace(/\.pdf$/i, ""), author: r.author, cover: r.cover, skipped: r.skipped, stats: r.stats };
    chapters = r.chapters.map((c) => ({ title: c.name, label: c.label, heading: c.title, paragraphs: c.paragraphs, pages: c.pages }));
    $("#bookTitle").value = book.title; titleEdited = false;
    if (book.author) $("#author").value = book.author;
    status.classList.add("hidden");
    showError("");
    showSections();
    renderFiles();
    renderChapters();
  } catch (err) {
    console.error(err);
    status.classList.add("hidden");
    showError(`Couldn't read ${file.name}: ${err.message}`);
  }
}
// Folders dropped onto the page: walk them for text files.
async function filesFromDrop(items) {
  const out = [];
  const walk = async (entry, path) => {
    if (entry.isFile) {
      const f = await new Promise((res, rej) => entry.file(res, rej));
      f.relPath = path + f.name;
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) if (!e.name.startsWith(".") && e.name !== "node_modules") await walk(e, path + entry.name + "/");
      } while (batch.length);
    }
  };
  const entries = [...items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  for (const e of entries) await walk(e, "");
  return out;
}

const drop = $("#drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", async (e) => {
  e.preventDefault();
  const items = e.dataTransfer.items;
  if (items && items.length && items[0].webkitGetAsEntry) addFiles(await filesFromDrop(items));
  else addFiles(e.dataTransfer.files);
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => e.preventDefault());
$("#pickFiles").onclick = () => $("#fileInput").click();
$("#pickFolder").onclick = () => $("#folderInput").click();
$("#fileInput").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
$("#folderInput").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
$("#pasteToggle").onclick = () => { $("#pasteBox").classList.toggle("hidden"); $("#pasteText").focus(); };
$("#pasteAdd").onclick = () => {
  const text = $("#pasteText").value;
  if (!text.trim()) return;
  const n = docs.filter((d) => d.pasted).length + 1;
  if (book) { book = null; titleEdited = false; }
  docs.push({ id: nextId++, name: $("#pasteName").value.trim() || `Pasted text ${n}`, text, pasted: true });
  $("#pasteText").value = ""; $("#pasteName").value = "";
  $("#pasteBox").classList.add("hidden");
  docsChanged();
};

function renderFiles() {
  if (book) {
    $("#files").innerHTML = `<span class="chip">📖 ${esc(book.fileName)} <span class="muted small">${book.stats.pages} pages · ${book.stats.words.toLocaleString()} words</span><button id="rmBook" aria-label="Remove ${esc(book.fileName)}">×</button></span>`;
    $("#rmBook").onclick = () => { book = null; chapters = []; titleEdited = false; docsChanged(); };
    return;
  }
  $("#files").innerHTML = docs.map((d) => `<span class="chip" title="${esc(d.path || d.name)}">${esc(d.name)} <span class="muted small">${words(d.text).toLocaleString()} words</span><button data-rm="${d.id}" aria-label="Remove ${esc(d.name)}">×</button></span>`).join("")
    + (docs.length > 1 ? `<button class="btn ghost" id="clearAll" style="padding:3px 10px;font-size:13px">Remove all</button>` : "");
  document.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { docs = docs.filter((d) => d.id !== +b.dataset.rm); docsChanged(); }));
  $("#clearAll") && ($("#clearAll").onclick = () => { docs = []; docsChanged(); });
}

let titleEdited = false;
$("#bookTitle").oninput = () => (titleEdited = true);
$("#splitMode").onchange = () => { chapters = buildChapters(docs, $("#splitMode").value); renderChapters(); };

function showSections() {
  const has = chapters.length > 0;
  ["#chapterCard", "#voiceCard", "#makeCard"].forEach((s) => $(s).classList.toggle("hidden", !has));
  $("#splitRow").classList.toggle("hidden", !!book);
}

function docsChanged() {
  renderFiles();
  if (!book) {
    chapters = buildChapters(docs, $("#splitMode").value);
    if (!titleEdited || !$("#bookTitle").value.trim()) { $("#bookTitle").value = bookTitle(docs); titleEdited = false; }
  }
  showSections();
  renderChapters();
}

// ---------- chapters ----------
// The text that will actually be spoken, as paragraphs. PDF chapters keep scene breaks as SCENE markers.
const SCENE = "\u0000scene";
function spokenParagraphs(c) {
  if (c.paragraphs) return c.paragraphs.map((p) => (p === SCENE ? p : cleanNovel(p))).filter(Boolean);
  return toParagraphs(c.text, { markdown: true });
}
function cleanNovel(p) {
  p = p.replace(/[­﻿]/g, "")
    .replace(/\.\s\.\s\./g, "…")          // ". . ." -> ellipsis
    .replace(/_{2,}/g, "…")               // redaction blanks become a pause
    .replace(/\s+([!?.,;:…”’)\]])/g, "$1") // stray spaces before punctuation
    .replace(/\s+/g, " ").trim();
  if (!p || !/[\p{L}\p{N}]/u.test(p)) return p === "…" ? "" : p;
  return /[.!?:;…"”’)\]—]$/.test(p) ? p : p + ".";
}
const chapterWords = (c) => spokenParagraphs(c).reduce((n, p) => n + (p === SCENE ? 0 : words(p)), 0);
const previewText = (c) => spokenParagraphs(c).map((p) => (p === SCENE ? "⁂" : p)).join("\n\n");
const announcement = (c, i) => {
  if (c.paragraphs) {
    const label = (c.label || c.title || `Part ${i + 1}`).replace(/[.!?:;]*$/, "");
    const heading = (c.heading || "").replace(/[.!?:;]*$/, "");
    // If the reader renamed the chapter, read the new name.
    const original = c.label && c.heading ? `${c.label}: ${c.heading}` : c.label || c.heading;
    if (c.title !== original) return `${c.title.replace(/[.!?:;]*$/, "")}.`;
    return heading ? `${label}. ${heading}.` : `${label}.`;
  }
  return `Chapter ${i + 1}. ${c.title.replace(/[.!?:;]*$/, "")}.`;
};

function renderChapters() {
  const list = $("#chapters");
  const counts = chapters.map(chapterWords);
  list.innerHTML = chapters.map((c, i) => {
    const w = counts[i];
    const pages = c.pages ? `pp. ${c.pages[0]}–${c.pages[1]} · ` : "";
    const preview = previewText(c);
    return `<li><div class="line">
      <span class="num">${i + 1}</span>
      <input type="text" class="grow" data-title="${i}" value="${esc(c.title)}" aria-label="Chapter ${i + 1} title">
      <span class="meta">${pages}${w.toLocaleString()} words · ${fmtMins(w * secPerWord).replace("about ", "~")}</span>
      <button class="icon" data-up="${i}" title="Move up" ${i ? "" : "disabled"}>↑</button>
      <button class="icon" data-down="${i}" title="Move down" ${i < chapters.length - 1 ? "" : "disabled"}>↓</button>
      <button class="icon" data-merge="${i}" title="Merge into the chapter above" ${i ? "" : "disabled"}>⤒</button>
      <button class="icon" data-del="${i}" title="Remove chapter">×</button>
    </div>
    <details><summary>What will be read</summary><pre>${esc(preview.slice(0, 4000))}${preview.length > 4000 ? "…" : ""}</pre></details></li>`;
  }).join("");
  list.querySelectorAll("[data-title]").forEach((el) => (el.oninput = () => (chapters[+el.dataset.title].title = el.value)));
  const move = (i, j) => { [chapters[i], chapters[j]] = [chapters[j], chapters[i]]; renderChapters(); };
  list.querySelectorAll("[data-up]").forEach((b) => (b.onclick = () => move(+b.dataset.up, +b.dataset.up - 1)));
  list.querySelectorAll("[data-down]").forEach((b) => (b.onclick = () => move(+b.dataset.down, +b.dataset.down + 1)));
  list.querySelectorAll("[data-merge]").forEach((b) => (b.onclick = () => {
    const i = +b.dataset.merge, a = chapters[i - 1], c = chapters[i];
    if (a.paragraphs && c.paragraphs) {
      a.paragraphs = [...a.paragraphs, SCENE, announcement(c, i), ...c.paragraphs];
      a.pages = [a.pages[0], c.pages[1]];
    } else if (!a.paragraphs && !c.paragraphs) {
      a.text += `\n\n## ${c.title}\n\n${c.text}`;
    }
    chapters.splice(i, 1); renderChapters();
  }));
  list.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { chapters.splice(+b.dataset.del, 1); renderChapters(); if (!chapters.length) { book = null; docsChanged(); } }));
  const w = counts.reduce((n, x) => n + x, 0);
  $("#total").innerHTML = `<strong>${chapters.length} chapter${chapters.length === 1 ? "" : "s"}</strong> · ${w.toLocaleString()} words · ${fmtMins(estimateSeconds())} of listening`;
  renderSkipped();
  updateEstimate();
}

function renderSkipped() {
  const box = $("#skipped");
  if (!book) { box.classList.add("hidden"); return; }
  const by = {};
  for (const s of book.skipped) (by[s.reason] ||= []).push(s.page);
  const plural = { "illustration": "illustrations", "chapter title page": "chapter title pages", "table of contents": "contents page", "blank": "blank pages", "front matter": "front-matter pages" };
  const parts = Object.entries(by).map(([r, ps]) => `${ps.length} ${ps.length === 1 ? r : plural[r] || r} <span class="muted">(p. ${ps.join(", ")})</span>`);
  const c = book.stats.contents;
  box.innerHTML = `<div><strong>Skipped ${book.skipped.length} pages</strong> that aren't read aloud: ${parts.join("; ")}.</div>`
    + (c && c.entries ? `<div style="margin-top:4px">${c.matches ? "✓ Chapters match the book's table of contents." : `The book's table of contents lists ${c.entries} entries; check the chapters above.`}</div>` : "")
    + (book.stats.footnoteLines ? `<div style="margin-top:4px">Skipped ${book.stats.footnoteLines} lines of footnotes.</div>` : "");
  box.classList.remove("hidden");
}

// ---------- speech engine pool ----------
let pool = null;

async function pickDevice() {
  const want = $("#engine").value;
  if (want === "wasm") return "wasm";
  let ok = false;
  try { ok = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch {}
  if (want === "webgpu" && !ok) throw new Error("This browser can't use the graphics card (WebGPU). Choose Processor or Automatic.");
  return ok ? "webgpu" : "wasm";
}

class Pool {
  constructor(device, size) {
    this.device = device; this.size = size; this.workers = []; this.queue = []; this.nextId = 1; this.dead = false;
  }
  spawn() {
    const w = new Worker(new URL("./tts-worker.js", import.meta.url), { type: "module" });
    w.busy = null;
    w.onmessage = ({ data: m }) => {
      if (m.type === "progress") this.onProgress?.(m);
      else if (m.type === "loaded") w.loaded?.resolve();
      else if (m.type === "error" && m.during === "load") w.loaded?.reject(new Error(m.message));
      else if (m.type === "audio" || m.type === "error") {
        const job = w.busy; w.busy = null;
        if (job) m.type === "audio" ? job.resolve(m) : job.reject(new Error(m.message));
        this.pump();
      }
    };
    w.onerror = (e) => { e.preventDefault?.(); const err = new Error("The speech engine stopped unexpectedly."); w.loaded?.reject(err); w.busy?.reject(err); w.busy = null; };
    this.workers.push(w);
    return w;
  }
  load(w) {
    return new Promise((resolve, reject) => { w.loaded = { resolve, reject }; w.postMessage({ type: "load", device: this.device }); });
  }
  async start() {
    // Load one engine first (this downloads the model), then the rest from the browser cache.
    await this.load(this.spawn());
    const more = Array.from({ length: this.size - 1 }, () => this.spawn());
    await Promise.all(more.map((w) => this.load(w).catch(() => { w.terminate(); this.workers.splice(this.workers.indexOf(w), 1); })));
    this.ready = true;
  }
  synth(text, voice, speed) {
    return new Promise((resolve, reject) => { this.queue.push({ text, voice, speed, resolve, reject }); this.pump(); });
  }
  pump() {
    for (const w of this.workers) {
      if (w.busy || !this.queue.length) continue;
      const job = this.queue.shift();
      w.busy = job;
      w.postMessage({ type: "synth", id: this.nextId++, text: job.text, voice: job.voice, speed: job.speed });
    }
  }
  terminate() {
    this.dead = true;
    for (const w of this.workers) { w.terminate(); w.busy?.reject(new Error("stopped")); }
    for (const j of this.queue) j.reject(new Error("stopped"));
    this.workers = []; this.queue = [];
  }
}

function resetPool() { pool?.terminate(); pool = null; $("#engineStatus").textContent = ""; }

async function getPool() {
  if (pool && pool.ready) return pool;
  if (pool && pool.starting) return pool.starting;
  const start = async (device) => {
    const size = device === "webgpu" ? 1 : Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
    const p = new Pool(device, size);
    const label = device === "webgpu" ? "graphics card" : `processor (${size} thread${size > 1 ? "s" : ""})`;
    p.onProgress = ({ loaded, total }) => {
      const t = total > loaded ? total : (device === "webgpu" ? 326 : 92) * 1048576;
      $("#engineStatus").textContent = `Downloading the voice model for the ${label}: ${fmtMB(loaded)} of ${total > loaded ? "" : "about "}${fmtMB(t)} (first time only)…`;
    };
    $("#engineStatus").textContent = `Starting the speech engine on the ${label}…`;
    pool = p;
    p.starting = p.start().then(() => p);
    try {
      await p.starting;
    } catch (err) {
      p.terminate(); pool = null;
      throw err;
    }
    p.starting = null;
    $("#engineStatus").textContent = `Speech engine ready on the ${label}.`;
    return p;
  };
  const device = await pickDevice();
  try {
    return await start(device);
  } catch (err) {
    if (device === "webgpu" && $("#engine").value === "auto") {
      $("#engineStatus").textContent = "The graphics card didn't work, so using the processor instead…";
      return start("wasm");
    }
    $("#engineStatus").textContent = "";
    throw err;
  }
}

// ---------- sample ----------
$("#sampleBtn").onclick = async () => {
  const btn = $("#sampleBtn");
  const audio = $("#sampleAudio");
  btn.disabled = true; btn.textContent = "Loading…";
  try {
    const p = await getPool();
    btn.textContent = "Making…";
    const firstPara = chapters.length ? spokenParagraphs(chapters[0]).find((p) => p !== SCENE && words(p) > 8) : "";
    const first = firstPara ? makeChunks([firstPara], 220)[0]?.text : "";
    const text = first || `Hi, I'm ${voiceName($("#voice").value)}. This is how your audiobook will sound.`;
    const m = await p.synth(text, $("#voice").value, +$("#speed").value);
    audio.src = URL.createObjectURL(new Blob([wavBytes(toInt16(m.samples), m.rate)], { type: "audio/wav" }));
    await audio.play();
  } catch (err) {
    showError("Couldn't play a sample: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "▶ Sample";
  }
};

// ---------- making the audiobook ----------
let run = null;
let lastSpeed = pref.get("lastSpeed", null); // seconds of audio per second of work, from the last run
// Seconds of audio per word at normal speed, including pauses. Learned from each finished book.
let secPerWord = pref.get("secPerWord", 0.48);

function estimateSeconds() {
  const w = chapters.reduce((n, c) => n + chapterWords(c), 0);
  return (w * secPerWord + chapters.length * ($("#announce").checked ? 4 : 1.5)) / (+$("#speed").value || 1);
}

function updateEstimate() {
  const audioSec = estimateSeconds();
  $("#estimate").textContent = lastSpeed
    ? `About ${fmtDur(audioSec)} of audio. On this computer that takes ${fmtMins(audioSec / lastSpeed)} to make.`
    : `About ${fmtDur(audioSec)} of audio.`;
}

function toInt16(f32, pad = 0) {
  const out = new Int16Array(f32.length + pad);
  for (let i = 0; i < f32.length; i++) { const x = Math.max(-1, Math.min(1, f32[i])); out[i] = x < 0 ? x * 32768 : x * 32767; }
  return out;
}
function wavBytes(pcm, rate) {
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(b, 44).set(pcm);
  return b;
}

const SEGMENT_SECONDS = self.__abmSegmentSeconds || 300; // encode every 5 minutes so memory stays flat

$("#createBtn").onclick = () => createBook().catch((err) => {
  console.error(err);
  if (run && !run.stopped) showError("Something went wrong: " + err.message);
  endRun();
});
$("#stopBtn").onclick = () => { if (run) { run.stopped = true; resetPool(); run.writer.terminate(); endRun(); } };
$("#againBtn").onclick = () => { $("#doneCard").classList.add("hidden"); $("#makeCard").scrollIntoView({ behavior: "smooth" }); };
window.addEventListener("beforeunload", (e) => { if (run) { e.preventDefault(); e.returnValue = ""; } });

async function createBook() {
  if (!chapters.length || run) return;
  showError("");
  $("#doneCard").classList.add("hidden");
  const voice = $("#voice").value, speed = +$("#speed").value, announce = $("#announce").checked;
  const title = $("#bookTitle").value.trim() || "Audiobook";
  const author = $("#author").value.trim();

  // Plan every piece of speech up front.
  const plan = chapters.map((c, ci) => {
    const pieces = [];
    for (const para of spokenParagraphs(c)) {
      if (para === SCENE) { if (pieces.length) pieces[pieces.length - 1].pauseAfter = 1.6; continue; }
      const chunks = makeChunks([para], 250);
      // Novels have many short paragraphs (dialogue), so they get a shorter pause than documents.
      if (c.paragraphs && chunks.length) chunks[chunks.length - 1].pauseAfter = 0.35;
      pieces.push(...chunks);
    }
    if (announce && pieces.length) pieces.unshift({ text: cleanNovel(announcement(c, ci)), pauseAfter: 1.0 });
    return { title: c.title || `Chapter ${ci + 1}`, pieces };
  }).filter((c) => c.pieces.length);
  const flat = plan.flatMap((c, ci) => c.pieces.map((p, k) => ({ ...p, ci, last: k === c.pieces.length - 1 })));
  const totalChars = flat.reduce((n, p) => n + p.text.length, 0);

  const writer = new AudiobookWriter();
  run = { stopped: false, writer, started: performance.now() };
  $("#makeIdle").classList.add("hidden");
  $("#makeRunning").classList.remove("hidden");
  setRun("Starting the speech engine…", 0, "");

  keepAlive(true);
  const [p] = await Promise.all([getPool(), writer.load()]);
  if (run.stopped) return;
  const t0 = performance.now();
  let rate = 24000, doneChars = 0, audioSec = 0;
  let seg = [], segSamples = 0;
  const marks = [];
  let chapterStart = 0;

  const flush = async () => {
    if (!segSamples) return;
    const pcm = new Int16Array(segSamples);
    let o = 0;
    for (const s of seg) { pcm.set(s, o); o += s.length; }
    seg = []; segSamples = 0;
    await writer.addSegment(pcm, rate);
  };

  // Keep every engine busy by asking for a few pieces ahead, then use them in order.
  const ahead = Math.max(2, p.size * 2);
  const pending = [];
  let next = 0;
  const fill = () => {
    while (next < flat.length && pending.length < ahead) {
      const piece = flat[next++];
      const job = p.synth(piece.text, voice, speed);
      job.catch(() => {}); // handled when awaited; avoids noise if the run is stopped
      pending.push(job);
    }
  };
  fill();
  for (let i = 0; i < flat.length; i++) {
    const piece = flat[i];
    const m = await pending.shift();
    fill();
    if (run.stopped) return;
    rate = m.rate;
    const pause = piece.pauseAfter + (piece.last ? 1.5 : 0);
    const pcm = toInt16(m.samples, Math.round(rate * pause));
    seg.push(pcm); segSamples += pcm.length;
    doneChars += piece.text.length;
    audioSec += pcm.length / rate;
    if (piece.last) {
      await flush();
      marks.push({ title: plan[piece.ci].title, start: chapterStart, end: writer.seconds });
      chapterStart = writer.seconds;
    } else if (segSamples >= rate * SEGMENT_SECONDS) {
      await flush();
    }
    if (run.stopped) return;
    const elapsed = (performance.now() - t0) / 1000;
    const speedX = audioSec / elapsed;
    const left = ((totalChars - doneChars) * elapsed) / doneChars;
    setRun(`Chapter ${piece.ci + 1} of ${plan.length}: ${plan[piece.ci].title}`, doneChars / totalChars,
      `${fmtDur(audioSec)} of audio made · ${speedX.toFixed(1)}× real time · ${left < 60 ? "under a minute" : fmtMins(left)} left`);
  }

  setRun("Packaging the audiobook…", 1, "Adding chapters and cover");
  const cover = book?.cover || (await makeCover(title, author, voiceName(voice)));
  const bytes = await writer.finish({ chapters: marks, title, author: author || `Read by ${voiceName(voice)}`, cover });
  writer.terminate();
  const elapsed = (performance.now() - t0) / 1000;
  lastSpeed = marks.at(-1).end / elapsed;
  pref.set("lastSpeed", lastSpeed);
  const totalWords = chapters.reduce((n, c) => n + chapterWords(c), 0);
  const overhead = marks.length * (announce ? 4 : 1.5);
  if (totalWords > 200) { secPerWord = Math.max(0.3, Math.min(0.8, ((marks.at(-1).end * speed) - overhead) / totalWords)); pref.set("secPerWord", secPerWord); }

  const blob = new Blob([bytes], { type: "audio/mp4" });
  const name = (title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Audiobook") + ".m4b";
  const a = $("#downloadBtn");
  if (a.href) URL.revokeObjectURL(a.href);
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.textContent = "Download " + name;
  $("#doneInfo").textContent = `${fmtDur(marks.at(-1).end)} · ${marks.length} chapter${marks.length === 1 ? "" : "s"} · ${fmtMB(blob.size)} · made in ${fmtMins(elapsed).replace("about ", "")}`;
  endRun();
  $("#doneCard").classList.remove("hidden");
  $("#doneCard").scrollIntoView({ behavior: "smooth" });
  a.click(); // start the download right away
}

function setRun(title, frac, status) {
  $("#runTitle").textContent = title;
  $("#runPct").textContent = Math.floor(frac * 100) + "%";
  $("#bar").style.width = (frac * 100).toFixed(1) + "%";
  $("#runStatus").textContent = status;
  document.title = run ? `${Math.floor(frac * 100)}% · Audiobook Maker` : "Audiobook Maker";
}
// While a book is being made: hold a Web Lock (browsers avoid freezing tabs that hold one) and,
// while the tab is visible, a screen wake lock so the computer doesn't go to sleep.
let lockRelease = null, wakeLock = null;
async function keepAlive(on) {
  if (on) {
    if (!lockRelease && navigator.locks) navigator.locks.request("audiobook-maker-run", () => new Promise((r) => (lockRelease = r))).catch(() => {});
    try { if (!wakeLock && document.visibilityState === "visible") wakeLock = await navigator.wakeLock?.request("screen"); wakeLock?.addEventListener?.("release", () => (wakeLock = null)); } catch {}
  } else {
    lockRelease?.(); lockRelease = null;
    try { await wakeLock?.release(); } catch {}
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => { if (run && document.visibilityState === "visible") keepAlive(true); });

function endRun() {
  keepAlive(false);
  run = null;
  document.title = "Audiobook Maker";
  $("#makeRunning").classList.add("hidden");
  $("#makeIdle").classList.remove("hidden");
  updateEstimate();
}
function showError(msg) { $("#makeError").textContent = msg; }

async function makeCover(title, author, voice) {
  const S = 1400;
  const c = new OffscreenCanvas(S, S), g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, "#d4561a"); grad.addColorStop(1, "#7c2d12");
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  g.fillStyle = "rgba(255,255,255,.12)";
  [0.22, 0.42, 0.62, 0.42, 0.22].forEach((h, i) => g.fillRect(S * 0.3 + i * S * 0.09, S * 0.78 - S * h * 0.35, S * 0.05, S * h * 0.35));
  g.fillStyle = "#fff6ee";
  g.textBaseline = "top";
  let size = 120;
  const fit = () => {
    g.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    const lines = [];
    let line = "";
    for (const word of title.split(/\s+/)) {
      const t = line ? line + " " + word : word;
      if (g.measureText(t).width > S * 0.8 && line) { lines.push(line); line = word; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  };
  let lines = fit();
  while ((lines.length > 5 || lines.some((l) => g.measureText(l).width > S * 0.8)) && size > 50) { size -= 8; lines = fit(); }
  lines.forEach((l, i) => g.fillText(l, S * 0.1, S * 0.12 + i * size * 1.15));
  g.font = `400 52px system-ui, "Segoe UI", sans-serif`;
  g.fillStyle = "rgba(255,246,238,.85)";
  g.fillText(author ? author : `Read by ${voice}`, S * 0.1, S * 0.12 + lines.length * size * 1.15 + 30);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  return new Uint8Array(await blob.arrayBuffer());
}

// Remove the old reader app's offline cache from earlier versions of this site.
navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});

window.__abm = { get chapters() { return chapters; }, get docs() { return docs; }, addDocs: (list) => { list.forEach((d) => docs.push({ id: nextId++, ...d })); docsChanged(); } };
