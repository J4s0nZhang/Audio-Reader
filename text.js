// Turns pasted text or Markdown into short, speakable chunks for Kokoro.
// Kokoro truncates anything past ~510 phoneme tokens, and its memory use grows with the length
// of each piece (about 380 MB at 180 characters), so pieces stay short. Total length doesn't matter.

const TERMINAL = /[.!?:;…]["'”’)\]]*$/;
const endWithPunctuation = (s) => (TERMINAL.test(s) ? s : s + ".");

/** Convert Markdown (or plain text) into a list of spoken paragraphs. */
export function toParagraphs(src, { markdown = true } = {}) {
  let t = String(src || "").replace(/\r\n?/g, "\n").replace(/\t/g, "  ");

  if (markdown) {
    // Fenced code blocks: reading code aloud is noise, so leave a short marker.
    t = t.replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, "\n\nCode example omitted.\n\n");
    t = t.replace(/<!--[\s\S]*?-->/g, "");
    t = t.replace(/<\/?[a-zA-Z][^>\n]*>/g, " ");
    t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
    t = t.replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$/gm, "");
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    t = t.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
    t = t.replace(/`([^`\n]+)`/g, "$1");
  }
  t = t.replace(/\bhttps?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"]/g, "a link");

  const paragraphs = [];
  let current = [];
  const flush = () => {
    const p = current.join(" ").replace(/\s+/g, " ").trim();
    if (p) paragraphs.push(p);
    current = [];
  };
  const standalone = (s) => {
    flush();
    s = s.replace(/\s+/g, " ").trim();
    if (s) paragraphs.push(endWithPunctuation(s));
  };

  for (let line of t.split("\n")) {
    if (!line.trim()) { flush(); continue; }
    if (markdown) {
      // Horizontal rules, setext underlines and table separator rows.
      if (/^\s*([-*_=])(\s*\1){2,}\s*$/.test(line)) { flush(); continue; }
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)) continue;
      line = line.replace(/^\s*(>\s?)+/, "");
      const heading = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
      if (heading) { standalone(stripEmphasis(heading[1])); continue; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        const cells = line.split("|").map((c) => stripEmphasis(c.trim())).filter(Boolean);
        standalone(cells.join(", "));
        continue;
      }
      const item = line.match(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
      if (item) { standalone(stripEmphasis(item[1])); continue; }
      line = stripEmphasis(line);
    }
    current.push(line.trim());
  }
  flush();
  return paragraphs;
}

function stripEmphasis(s) {
  return s
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(^|[\s(“"'])([*_])(?=\S)([^*_\n]*?\S)\2(?=[\s).,!?:;”"']|$)/g, "$1$3")
    .replace(/~~(.+?)~~/g, "$1");
}

/** Split on a boundary regex (which must have the g flag), keeping the delimiter on the left piece. */
function splitAfter(s, re) {
  const out = [];
  let last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(s))) {
    const end = m.index + m[0].length;
    const piece = s.slice(last, end).trim();
    if (piece) out.push(piece);
    last = end;
  }
  const tail = s.slice(last).trim();
  if (tail) out.push(tail);
  return out;
}

const SENTENCE_END = /[.!?…]+["'”’)\]]*\s+/g;
const CLAUSE_END = /[,;:—–]\s+/g;

function pack(pieces, max) {
  const out = [];
  let cur = "";
  for (const p of pieces) {
    if (!cur) cur = p;
    else if (cur.length + 1 + p.length <= max) cur += " " + p;
    else { out.push(cur); cur = p; }
  }
  if (cur) out.push(cur);
  return out;
}

function splitLong(sentence, max) {
  if (sentence.length <= max) return [sentence];
  const clauses = splitAfter(sentence, CLAUSE_END).flatMap((c) => {
    if (c.length <= max) return [c];
    return pack(c.split(/\s+/), max); // last resort: split between words
  });
  return pack(clauses, max);
}

/**
 * Build generation chunks. Each chunk is a few sentences from one paragraph;
 * pauseAfter adds a short silence so paragraph breaks are audible.
 */
export function makeChunks(paragraphs, max = 180) {
  const chunks = [];
  for (const p of paragraphs) {
    const sentences = splitAfter(p, SENTENCE_END).flatMap((s) => splitLong(s, max));
    const pieces = pack(sentences, max);
    pieces.forEach((text, k) => chunks.push({ text, pauseAfter: k === pieces.length - 1 ? 0.5 : 0.15 }));
  }
  return chunks;
}

export function chunkText(src, opts = {}) {
  return makeChunks(toParagraphs(src, opts), opts.max || 180);
}

/** Small stable hash so we can tell when text changed and audio is stale. */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

// ---------- chapters ----------

const cleanTitle = (s) => s.replace(/[*_`~]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+#*\s*$/, "").trim();
const fileTitle = (name) => String(name || "Untitled").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
const words = (t) => (String(t).match(/\S+/g) || []).length;

/** Markdown headings outside code blocks: [{ level, title, line }]. */
export function headingsOf(text) {
  const out = [];
  let fence = null;
  String(text).split(/\r?\n/).forEach((l, line) => {
    const f = l.match(/^[ \t]*(`{3,}|~{3,})/);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; return; }
    if (fence) return;
    const h = l.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (h) out.push({ level: h[1].length, title: cleanTitle(h[2]), line });
  });
  return out;
}

/** Split one document at headings of the given levels. Text before the first heading becomes an intro. */
function splitAt(doc, levels) {
  const lines = String(doc.text).split(/\r?\n/);
  const cuts = headingsOf(doc.text).filter((h) => levels.includes(h.level));
  if (!cuts.length) return [{ title: doc.title, text: doc.text }];
  const parts = [];
  const intro = lines.slice(0, cuts[0].line).join("\n").trim();
  // A lone top heading that names the document isn't content.
  const introBody = intro.replace(/^\s{0,3}#\s+.*$/m, "").trim();
  if (words(introBody) >= 40) parts.push({ title: "Introduction", text: introBody });
  cuts.forEach((h, k) => {
    let body = lines.slice(h.line + 1, k + 1 < cuts.length ? cuts[k + 1].line : lines.length).join("\n").trim();
    if (k === 0 && introBody && words(introBody) < 40) body = introBody + "\n\n" + body;
    parts.push({ title: h.title, text: body });
  });
  return parts;
}

/**
 * Turn input documents into chapters.
 * mode: "auto" (each file is a chapter; a single file is split at its main headings),
 *       "files" (one chapter per file), "headings" (split at every # and ## heading).
 */
export function buildChapters(docs, mode = "auto") {
  return buildChaptersRaw(docs, mode).filter((c) => c.text.trim());
}

function buildChaptersRaw(docs, mode) {
  docs = docs.filter((d) => String(d.text || "").trim()).map((d) => {
    const hs = headingsOf(d.text);
    const h1s = hs.filter((h) => h.level === 1);
    return { ...d, title: h1s.length === 1 ? h1s[0].title : fileTitle(d.name), hs };
  });
  if (!docs.length) return [];
  if (mode === "files") return docs.map((d) => ({ title: d.title, text: stripLeadingH1(d.text) }));
  if (mode === "headings") return docs.flatMap((d) => splitAt(d, [1, 2]).map(nameIntro(d, docs.length)));
  // auto
  if (docs.length > 1) return docs.map((d) => ({ title: d.title, text: stripLeadingH1(d.text) }));
  const d = docs[0];
  const count = (lvl) => d.hs.filter((h) => h.level === lvl).length;
  const level = count(1) >= 2 ? 1 : count(2) >= 2 ? 2 : count(3) >= 2 ? 3 : 0;
  if (!level) return [{ title: d.title, text: stripLeadingH1(d.text) }];
  return splitAt(d, [level]).map(nameIntro(d, 1));
}

const nameIntro = (d, n) => (c) => (c.title === "Introduction" && n > 1 ? { ...c, title: d.title } : c);
const stripLeadingH1 = (t) => String(t).replace(/^\s*#\s+.*(\r?\n|$)/, "").trim();

/** Default book title for a set of documents. */
export function bookTitle(docs) {
  const named = docs.filter((d) => String(d.text || "").trim());
  if (!named.length) return "";
  const hs = headingsOf(named[0].text).filter((h) => h.level === 1);
  const first = hs.length === 1 ? hs[0].title : fileTitle(named[0].name);
  return named.length === 1 ? first : first + (named.length > 1 ? " and more" : "");
}
