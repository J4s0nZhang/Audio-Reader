// Encodes speech to AAC piece by piece and packages it as an .m4b audiobook with chapters,
// using ffmpeg compiled to WebAssembly. Only compressed audio is kept in memory.
import { FFmpeg } from "./lib/ffmpeg/index.js";

const CORE = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/";

export class AudiobookWriter {
  constructor({ bitrate = "64k", onLog } = {}) {
    this.bitrate = bitrate;
    this.ff = new FFmpeg();
    if (onLog) this.ff.on("log", ({ message }) => onLog(message));
    this.segments = []; // { bytes: Uint8Array, seconds }
    this.n = 0;
    this.rate = 24000;
  }

  async load() {
    if (this.ff.loaded) return;
    await this.ff.load({ coreURL: CORE + "ffmpeg-core.js", wasmURL: CORE + "ffmpeg-core.wasm" });
  }

  /** Encode a run of 16-bit mono PCM. Returns its exact playback length in seconds. */
  async addSegment(pcm, rate) {
    this.rate = rate;
    const name = `s${this.n++}`;
    await this.ff.writeFile(name + ".wav", new Uint8Array(wav(pcm, rate)));
    const code = await this.ff.exec(["-hide_banner", "-loglevel", "error", "-i", name + ".wav",
      "-c:a", "aac", "-b:a", this.bitrate, "-f", "adts", name + ".aac"]);
    await this.ff.deleteFile(name + ".wav");
    if (code !== 0) throw new Error("Audio encoding failed");
    const bytes = await this.ff.readFile(name + ".aac");
    await this.ff.deleteFile(name + ".aac");
    const seconds = (countAdtsFrames(bytes) * 1024) / rate;
    this.segments.push({ bytes, seconds });
    return seconds;
  }

  get seconds() { return this.segments.reduce((n, s) => n + s.seconds, 0); }
  get bytes() { return this.segments.reduce((n, s) => n + s.bytes.length, 0); }

  /**
   * Join everything into an .m4b.
   * chapters: [{ title, start, end }] in seconds.
   */
  async finish({ chapters, title, author, cover }) {
    const total = new Uint8Array(this.bytes);
    let o = 0;
    for (const s of this.segments) { total.set(s.bytes, o); o += s.bytes.length; }
    this.segments = [];
    await this.ff.writeFile("book.aac", total);
    await this.ff.writeFile("meta.txt", new TextEncoder().encode(ffmetadata({ chapters, title, author })));
    const args = ["-hide_banner", "-loglevel", "error", "-i", "book.aac", "-i", "meta.txt"];
    if (cover) {
      await this.ff.writeFile("cover.jpg", cover);
      args.push("-i", "cover.jpg", "-map", "0:a", "-map", "2:v", "-disposition:v:0", "attached_pic");
    } else {
      args.push("-map", "0:a");
    }
    args.push("-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", "-f", "ipod", "book.m4b");
    const code = await this.ff.exec(args);
    await this.ff.deleteFile("book.aac");
    if (code !== 0) throw new Error("Couldn't package the audiobook");
    const out = await this.ff.readFile("book.m4b");
    await this.ff.deleteFile("book.m4b");
    return out;
  }

  terminate() { try { this.ff.terminate(); } catch {} }
}

function countAdtsFrames(b) {
  let n = 0, i = 0;
  while (i + 7 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xf0) !== 0xf0) throw new Error("Unexpected AAC data");
    const len = ((b[i + 3] & 0x03) << 11) | (b[i + 4] << 3) | ((b[i + 5] & 0xe0) >> 5);
    if (len < 7) throw new Error("Unexpected AAC data");
    i += len; n++;
  }
  return n;
}

const metaEscape = (s) => String(s).replace(/[=;#\\\n]/g, (c) => (c === "\n" ? " " : "\\" + c));

function ffmetadata({ chapters, title, author }) {
  let s = ";FFMETADATA1\n";
  if (title) s += `title=${metaEscape(title)}\nalbum=${metaEscape(title)}\n`;
  if (author) s += `artist=${metaEscape(author)}\nalbum_artist=${metaEscape(author)}\n`;
  s += "genre=Audiobook\n";
  for (const c of chapters) {
    s += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${metaEscape(c.title)}\n`;
  }
  return s;
}

export function wav(pcm, rate) {
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(b, 44).set(pcm);
  return b;
}
