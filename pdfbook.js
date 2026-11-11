// Turns a novel PDF into chapters of clean paragraphs, using the page layout:
// body text size, paragraph indents, repeated headers/footers, illustration pages, and
// chapter headings (PDF bookmarks, title pages, section headers, or "Chapter 1"-style lines).
import * as pdfjs from "./lib/pdfjs/pdf.min.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./lib/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
const CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/";
export const SCENE = "\u0000scene";

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const norm = (t) => t.trim().toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ");
const CHAPTER_WORD = /^(chapter|prologue|epilogue|afterword|interlude|intermission|intro|introduction|preface|foreword|part|book|act|bridge|side ?story|extra|bonus|appendix|final chapter)\b/i;
const FRONT_MATTER = /^(cover|title( page)?|copyright|contents|table of contents|color (inserts?|illustrations?)|inserts?|illustrations?|newsletter|credits?|about the (author|publisher)|front matter|dedication)$/i;
const SCENE_LINE = /^[\s×*#~◇◆◊•·＊※○●◎□■✦✧⁂§\-–—=_]{1,20}$/;

function mul(m, t) {
  return [t[0] * m[0] + t[1] * m[2], t[0] * m[1] + t[1] * m[3], t[2] * m[0] + t[3] * m[2], t[2] * m[1] + t[3] * m[3],
    t[4] * m[0] + t[5] * m[2] + m[4], t[4] * m[1] + t[5] * m[3] + m[5]];
}

/** Fraction of the page covered by images, from the drawing operations. */
function imageCoverage(ops, W, H) {
  const O = pdfjs.OPS;
  const paints = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintJpegXObject].filter((x) => x != null));
  let ctm = [1, 0, 0, 1, 0, 0], area = 0;
  const stack = [];
  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k], a = ops.argsArray[k];
    if (fn === O.save) stack.push(ctm);
    else if (fn === O.restore) ctm = stack.pop() || ctm;
    else if (fn === O.transform) ctm = mul(ctm, a);
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (paints.has(fn)) {
      const xs = [ctm[4], ctm[4] + ctm[0], ctm[4] + ctm[2], ctm[4] + ctm[0] + ctm[2]];
      const ys = [ctm[5], ctm[5] + ctm[1], ctm[5] + ctm[3], ctm[5] + ctm[1] + ctm[3]];
      const w = Math.min(W, Math.max(...xs)) - Math.max(0, Math.min(...xs));
      const h = Math.min(H, Math.max(...ys)) - Math.max(0, Math.min(...ys));
      if (w > 0 && h > 0) area += w * h;
    }
  }
  return area / (W * H);
}

/** Group text items into lines (top-down), each with size, x, y, bold, and cells split at wide gaps. */
function buildLines(tc, H, fontNames) {
  const items = tc.items.filter((it) => typeof it.str === "string" && it.str.length && it.transform)
    .map((it) => {
      const t = it.transform;
      const size = Math.hypot(t[2], t[3]) || Math.abs(t[3]) || 1;
      return { s: it.str, x: t[4], y: H - t[5], w: it.width, size, bold: /bold|black|heavy|semibold|-bd\b|bd$/i.test(fontNames(it.fontName)) };
    });
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const l = lines.length ? lines[lines.length - 1] : null;
    if (l && Math.abs(it.y - l.y) < Math.max(2, it.size * 0.45)) l.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    let text = "", cells = [""], prevEnd = null, size = 0, chars = 0, bold = 0;
    for (const it of l.items) {
      if (prevEnd != null) {
        const gap = it.x - prevEnd;
        if (gap > it.size * 1.5) { cells.push(""); }
        if (gap > it.size * 0.18 && !/\s$/.test(text) && !/^\s/.test(it.s) && !/^[-\u00ad]$/.test(it.s)) text += " ";
      }
      text += it.s;
      cells[cells.length - 1] += (cells[cells.length - 1] && !/\s$/.test(cells[cells.length - 1]) && prevEnd != null && it.x - prevEnd > it.size * 0.18 ? " " : "") + it.s;
      prevEnd = it.x + it.w;
      const n = it.s.trim().length;
      if (n) { size = Math.max(size, it.size); chars += n; if (it.bold) bold += n; }
    }
    return { text, cells: cells.map((c) => c.trim()).filter(Boolean), x: l.items[0].x, y: l.y, size: Math.round(size * 10) / 10, bold: chars > 0 && bold / chars > 0.6 };
  }).filter((l) => l.text.trim());
}

async function outlineChapters(pdf) {
  let outline;
  try { outline = await pdf.getOutline(); } catch { return []; }
  if (!outline || outline.length < 2) return [];
  const out = [];
  for (const item of outline) {
    try {
      let dest = item.dest;
      if (typeof dest === "string") dest = await pdf.getDestination(dest);
      if (!Array.isArray(dest) || !dest[0]) continue;
      const idx = typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0]);
      out.push({ title: (item.title || "").trim(), page: idx + 1 });
    } catch {}
  }
  return out.sort((a, b) => a.page - b.page);
}

async function renderCover(page) {
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 1400 / Math.max(vp1.width, vp1.height));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Analyze a PDF. Returns { title, author, cover, chapters, skipped, stats }.
 * chapters: [{ label, title, name, announce, pages: [first, last], paragraphs: [...] }]
 * (paragraphs may contain SCENE markers for scene breaks).
 */
export async function analyzePdf(data, onProgress = () => {}) {
  const pdf = await pdfjs.getDocument({ data, cMapUrl: CDN + "cmaps/", cMapPacked: true, standardFontDataUrl: CDN + "standard_fonts/", isEvalSupported: false }).promise;
  const N = pdf.numPages;
  const pages = [];
  for (let n = 1; n <= N; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const [tc, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const fontNames = (id) => { try { return page.commonObjs.has(id) ? page.commonObjs.get(id).name || "" : ""; } catch { return ""; } };
    pages.push({ n, W: vp.width, H: vp.height, lines: buildLines(tc, vp.height, fontNames), img: imageCoverage(ops, vp.width, vp.height) });
    page.cleanup();
    onProgress(n / N, `Reading page ${n} of ${N}`);
  }

  // ---- layout: body size, headers/footers, margins, line spacing ----
  const sizes = new Map();
  for (const p of pages) for (const l of p.lines) sizes.set(l.size, (sizes.get(l.size) || 0) + l.text.length);
  const body = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  if (!pages.some((p) => p.lines.length)) {
    throw new Error("This PDF has no text layer (it's probably scanned images), so it can't be read aloud.");
  }
  const seen = new Map();
  const key = (p, l) => norm(l.text) + "@" + Math.round(l.y / 4);
  for (const p of pages) for (const l of p.lines) if (l.y < p.H * 0.15 || l.y > p.H * 0.85) seen.set(key(p, l), (seen.get(key(p, l)) || 0) + 1);
  // Also count by text alone (running heads can sit at slightly different heights on left/right pages).
  const seenText = new Map();
  for (const p of pages) for (const l of p.lines) if ((l.y < p.H * 0.12 || l.y > p.H * 0.9) && l.text.trim().length < 40) seenText.set(norm(l.text), (seenText.get(norm(l.text)) || 0) + 1);
  const minRepeat = Math.max(3, Math.min(5, Math.ceil(N * 0.1)));
  const furniture = (p, l) => (l.y < p.H * 0.15 || l.y > p.H * 0.85) && l.size <= body * 1.1 && (l.text.trim().length < 45 || l.size < body * 0.95) && (
    (seen.get(key(p, l)) || 0) >= minRepeat ||
    ((l.y < p.H * 0.12 || l.y > p.H * 0.9) && (seenText.get(norm(l.text)) || 0) >= 2 && l.text.trim().length < 40) ||
    /^\s*\d{1,4}\s*$/.test(l.text));
  let footnoteLines = 0;
  for (const p of pages) {
    p.content = p.lines.filter((l) => !furniture(p, l));
    const small = p.content.filter((l) => l.size < body * 0.85 && l.y > p.H * 0.6);
    if (small.length && small.length < p.content.length) { footnoteLines += small.length; p.content = p.content.filter((l) => !small.includes(l)); }
  }
  const bodyLines = pages.flatMap((p) => p.content.filter((l) => Math.abs(l.size - body) < 0.6));
  const xs = new Map();
  for (const l of bodyLines) { const x = Math.round(l.x); xs.set(x, (xs.get(x) || 0) + 1); }
  const common = [...xs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const left = Math.min(...common.slice(0, 3).map((c) => c[0]));
  const indentCand = common.filter(([x, c]) => x > left + 5 && x < left + 60 && c > bodyLines.length * 0.03).map((c) => c[0]);
  const indent = indentCand.length ? Math.min(...indentCand) : null;
  const gaps = [];
  for (const p of pages) for (let k = 1; k < p.content.length; k++) {
    const g = p.content[k].y - p.content[k - 1].y;
    if (g > 0 && Math.abs(p.content[k].size - body) < 0.6) gaps.push(g);
  }
  const lineGap = median(gaps) || body * 1.3;

  // ---- classify pages ----
  let contentsPage = null;
  const titlePages = [];
  for (const p of pages) {
    const big = p.content.filter((l) => l.size >= body * 1.6);
    const bodyChars = p.content.filter((l) => l.size < body * 1.6).reduce((n, l) => n + l.text.trim().length, 0);
    if (big.some((l) => /^\s*(table of )?contents\s*$/i.test(l.text))) { p.kind = "contents"; contentsPage = p; }
    else if (big.length && bodyChars < 200) { p.kind = "title"; titlePages.push(p); }
    else if (p.img > 0.5 && bodyChars < 150) p.kind = "image";
    else if (p.content.reduce((n, l) => n + l.text.trim().length, 0) < 30) p.kind = p.img > 0.3 ? "image" : "blank";
    else p.kind = "text";
  }

  // ---- chapter starts, as positions in the reading stream ----
  // stream: every content line of text pages, in order; chapter starts point at an index.
  const stream = [];
  const starts = [];
  const outline = await outlineChapters(pdf);
  const outlineByPage = new Map();
  for (const o of outline) if (!outlineByPage.has(o.page)) outlineByPage.set(o.page, o);
  const useOutline = outline.filter((o) => !FRONT_MATTER.test(o.title)).length >= 2;
  let lastTitle = null; // title page waiting for its text

  for (const p of pages) {
    if (useOutline) {
      const o = outlineByPage.get(p.n);
      if (o) {
        if (FRONT_MATTER.test(o.title)) starts.push({ at: stream.length, skip: true, page: p.n, label: o.title, title: "" });
        else starts.push({ at: stream.length, page: p.n, label: o.title, title: "" });
      }
    }
    if (p.kind === "title") {
      const big = p.content.filter((l) => l.size >= body * 1.6).map((l) => l.text.trim());
      // On the very first pages, big type is usually the book's own title, not a chapter.
      lastTitle = { page: p.n, label: big[0], title: big.slice(1).join(" ") };
      if (!useOutline) starts.push({ at: stream.length, page: p.n, label: lastTitle.label, title: lastTitle.title, fromTitlePage: true });
      continue;
    }
    if (p.kind !== "text") continue;
    p.content.forEach((l, k) => {
      const t = l.text.trim();
      const isHeadingSize = l.size >= body * 1.6;
      const isSection = k < 2 && t.length < 70 && !/[.,;]$/.test(t) && (l.bold || l.size > body * 1.08) && l.size < body * 1.6;
      if (!useOutline && isHeadingSize) {
        // Big heading inside a text page: a chapter starting mid-page. Merge consecutive big lines.
        const prev = starts[starts.length - 1];
        if (prev && prev.at === stream.length && prev.inline) prev.title = (prev.title ? prev.title + " " : "") + t;
        else starts.push({ at: stream.length, page: p.n, label: t, title: "", inline: true });
        return;
      }
      if (isSection) {
        const dupOfTitle = lastTitle && p.n - lastTitle.page <= 2 && norm(t) === norm(lastTitle.label);
        if (dupOfTitle || useOutline) return; // repeated chapter label under a title page: don't read it
        starts.push({ at: stream.length, page: p.n, label: t, title: "", section: true });
        return;
      }
      stream.push({ ...l, page: p.n, pageTop: k === 0, topBand: l.y < p.H * 0.15 });
    });
  }

  let method = useOutline ? "bookmarks" : starts.length ? "headings" : "";
  if (!starts.length) {
    // Fallback: standalone "Chapter 3" / "Prologue" lines.
    const found = [];
    stream.forEach((l, i) => {
      const t = l.text.trim();
      if (t.length < 70 && CHAPTER_WORD.test(t) && !/[.,;:]$/.test(t) && (l.size > body * 1.1 || l.bold || l.x > left + 40)) found.push(i);
    });
    for (let k = found.length - 1; k >= 0; k--) {
      const i = found[k];
      const l = stream[i];
      const next = stream[i + 1];
      const subtitle = next && next.page === l.page && next.y - l.y < lineGap * 2.5 && (next.size > body * 1.1 || next.bold || next.x > left + 40) && next.text.trim().length < 70 ? next.text.trim() : "";
      stream.splice(i, subtitle ? 2 : 1);
      starts.push({ at: i, page: l.page, label: l.text.trim(), title: subtitle });
    }
    starts.sort((a, b) => a.at - b.at);
    if (starts.length) method = "chapter lines";
  }

  // Running heads that show the chapter's name (e.g. "Afterword" at the top of its pages) are
  // too rare to count as repeated furniture, so drop top-of-page lines that match a chapter heading.
  const headingNames = new Set(starts.flatMap((s) => [s.label, s.title, (s.label || "").split(/[:—–]/)[0]].filter(Boolean).map(norm)));
  let biggest = null;
  for (const p of pages.slice(0, 12)) for (const l of p.lines) if (!biggest || l.size > biggest.size) biggest = l;
  if (biggest) headingNames.add(norm(biggest.text));
  for (const l of stream) if (l.topBand && l.text.trim().length < 60 && headingNames.has(norm(l.text))) l.skipRead = true;

  // ---- paragraphs ----
  const paragraphsOf = (lines) => {
    const paras = [];
    let cur = "";
    let prev = null;
    const push = () => { if (cur.trim()) paras.push(cur.trim()); cur = ""; };
    for (const l of lines) {
      if (l.skipRead) continue;
      let t = l.text.replace(/﻿/g, "").replace(/\s+$/, "");
      if (!t.trim()) continue;
      if (SCENE_LINE.test(t.trim()) && !/["“”]/.test(t)) { push(); if (paras.length && paras[paras.length - 1] !== SCENE) paras.push(SCENE); prev = l; continue; }
      const indented = indent != null && Math.round(l.x) >= indent - 2 && Math.round(l.x) <= indent + 30;
      const centered = l.x > left + 60;
      const gapBreak = prev && prev.page === l.page && l.y - prev.y > lineGap * 1.45;
      const sizeChange = prev && Math.abs(prev.size - l.size) > 0.6;
      if (cur && (indented || centered || gapBreak || sizeChange || (indent == null && l.pageTop && /[.!?”"’]$/.test(cur)))) push();
      t = t.trim();
      if (cur.endsWith("­")) cur = cur.slice(0, -1) + t;
      else if (/[a-z]-$/.test(cur) && /^[a-z]/.test(t)) cur = cur.slice(0, -1) + t; // hyphenated line break
      else if (!cur || /[—–]$/.test(cur)) cur += t;
      else cur += " " + t;
      prev = l;
    }
    push();
    while (paras[0] === SCENE) paras.shift();
    while (paras[paras.length - 1] === SCENE) paras.pop();
    return paras.map((x) => (x === SCENE ? x : x.replace(/­/g, "")));
  };

  const chapters = [];
  const bounds = starts.map((s) => s.at).concat(stream.length);
  const before = stream.slice(0, starts.length ? starts[0].at : stream.length);
  const frontWords = before.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  if (!starts.length || frontWords >= 300) {
    // Text before the first heading is real content (an untitled opening), not front matter.
    starts.unshift({ at: 0, page: before[0]?.page || 1, label: starts.length ? "Opening" : "", title: "" });
    bounds.unshift(0);
  }
  starts.forEach((s, i) => {
    if (s.skip) return;
    const lines = stream.slice(s.at, bounds[i + 1]);
    const paragraphs = paragraphsOf(lines);
    if (!paragraphs.length) return;
    const strip = (t) => (t || "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/[^\p{L}\p{N}?!.)\]_]+$/u, "").trim();
    const title = strip(s.title);
    const hasTitle = /[\p{L}\p{N}]/u.test(title);
    const label = strip(s.label);
    const name = label && hasTitle ? `${label}: ${title}` : label || (hasTitle ? title : `Part ${chapters.length + 1}`);
    chapters.push({
      label, title: hasTitle ? title : "", name,
      pages: [s.page, (lines.filter((l) => !l.skipRead).pop() || {}).page || s.page],
      paragraphs,
    });
  });
  if (!chapters.length) throw new Error("Couldn't find any readable text in this PDF.");

  // ---- book title, author, cover ----
  let meta = {};
  try { meta = (await pdf.getMetadata()).info || {}; } catch {}
  let title = (meta.Title || "").trim();
  if (!title || /^untitled|\.(pdf|docx?|indd)$/i.test(title)) {
    let best = null;
    for (const p of pages.slice(0, 12)) for (const l of p.lines) if (!best || l.size > best.l.size) best = { p, l };
    if (best && best.l.size > body * 1.8) {
      const i = best.p.lines.indexOf(best.l);
      const next = best.p.lines[i + 1];
      title = best.l.text.trim() + (next && next.size >= body && next.text.trim().length < 30 && next.y - best.l.y < best.l.size * 3 ? " " + next.text.trim() : "");
    }
  }
  const author = (meta.Author || "").trim();
  let cover = null;
  const coverPage = pages.slice(0, 3).find((p) => p.kind === "image" && p.img > 0.8) || null;
  if (coverPage) { try { cover = await renderCover(await pdf.getPage(coverPage.n)); } catch {} }

  // ---- what was skipped, for the review screen ----
  const used = new Set();
  for (const c of chapters) for (let n = c.pages[0]; n <= c.pages[1]; n++) used.add(n);
  const skipped = [];
  for (const p of pages) {
    if (p.kind === "image") skipped.push({ page: p.n, reason: "illustration" });
    else if (p.kind === "title") skipped.push({ page: p.n, reason: "chapter title page" });
    else if (p.kind === "contents") skipped.push({ page: p.n, reason: "table of contents" });
    else if (p.kind === "blank") skipped.push({ page: p.n, reason: "blank" });
    else if (!used.has(p.n)) skipped.push({ page: p.n, reason: "front matter" });
  }

  // ---- cross-check with a contents page ----
  let contents = null;
  if (contentsPage) {
    const rows = contentsPage.content.filter((l) => l.cells.length >= 2 && /^\d{1,4}$/.test(l.cells[l.cells.length - 1]));
    contents = { entries: rows.length, matches: rows.length === chapters.filter((c) => c.label !== "Afterword" && c.label !== "Opening").length };
  }
  pdf.destroy();
  return {
    title: title.replace(/\s+/g, " "), author, cover, chapters, skipped,
    stats: { pages: N, method, body, indent, footnoteLines, contents, words: chapters.reduce((n, c) => n + c.paragraphs.reduce((m, p) => m + (p === SCENE ? 0 : p.split(/\s+/).length), 0), 0) },
  };
}
