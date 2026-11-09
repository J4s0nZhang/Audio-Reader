// Turns pasted text or Markdown into short, speakable chunks for Kokoro.
// Kokoro truncates anything past ~510 phoneme tokens, so chunks stay well under that.

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
export function makeChunks(paragraphs, max = 300) {
  const chunks = [];
  for (const p of paragraphs) {
    const sentences = splitAfter(p, SENTENCE_END).flatMap((s) => splitLong(s, max));
    const pieces = pack(sentences, max);
    pieces.forEach((text, k) => chunks.push({ text, pauseAfter: k === pieces.length - 1 ? 0.5 : 0.15 }));
  }
  return chunks;
}

export function chunkText(src, opts = {}) {
  return makeChunks(toParagraphs(src, opts), opts.max || 300);
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
