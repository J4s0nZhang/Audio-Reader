// Runs Kokoro off the main thread so the page stays responsive while it works.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let tts = null;
let loadedKey = null;
let loading = null;
const cancelled = new Set();

async function load(engine) {
  const opts = engine === "webgpu"
    ? { device: "webgpu", dtype: "fp32" }
    : { device: "wasm", dtype: "q8" };
  const key = opts.device + ":" + opts.dtype;
  if (tts && loadedKey === key) return tts;
  if (loading && loading.key === key) return loading.promise;

  const promise = (async () => {
    const files = {};
    const model = await KokoroTTS.from_pretrained(MODEL_ID, {
      ...opts,
      progress_callback: (p) => {
        if (p.status === "progress" && p.file) {
          files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
          let loaded = 0, total = 0;
          for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
          postMessage({ type: "load-progress", loaded, total });
        }
      },
    });
    tts = model;
    loadedKey = key;
    return model;
  })();
  loading = { key, promise };
  try {
    return await promise;
  } finally {
    loading = null;
  }
}

async function synth(text, voice, speed) {
  const audio = await tts.generate(text, { voice, speed });
  // Copy so the transferred buffer holds exactly these samples.
  return { samples: new Float32Array(audio.audio), rate: audio.sampling_rate };
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      const t0 = performance.now();
      await load(msg.engine);
      postMessage({ type: "loaded", engine: msg.engine, ms: performance.now() - t0 });
    } else if (msg.type === "cancel") {
      cancelled.add(msg.jobId);
    } else if (msg.type === "preview") {
      await load(msg.engine);
      const { samples, rate } = await synth(msg.text, msg.voice, msg.speed);
      postMessage({ type: "preview", id: msg.id, samples, rate }, [samples.buffer]);
    } else if (msg.type === "generate") {
      await load(msg.engine);
      let skippedInARow = 0;
      for (const chunk of msg.chunks) {
        if (cancelled.has(msg.jobId)) break;
        const t0 = performance.now();
        let out, skipped = false;
        try {
          out = await synth(chunk.text, msg.voice, msg.speed);
        } catch (err) {
          // One odd passage shouldn't stop the whole document: retry with plain characters, then skip it.
          console.warn("Retrying part", chunk.i, err);
          try {
            out = await synth(chunk.text.replace(/[^\p{L}\p{N}\s.,!?;:'"()-]/gu, " "), msg.voice, msg.speed);
          } catch {
            if (++skippedInARow >= 3) throw err; // something is wrong with the engine, not the text
            out = { samples: new Float32Array(7200), rate: 24000 };
            skipped = true;
          }
        }
        if (!skipped) skippedInARow = 0;
        if (cancelled.has(msg.jobId)) break;
        postMessage(
          { type: "chunk", jobId: msg.jobId, i: chunk.i, samples: out.samples, rate: out.rate, skipped, ms: performance.now() - t0 },
          [out.samples.buffer],
        );
      }
      postMessage({ type: "done", jobId: msg.jobId, cancelled: cancelled.has(msg.jobId) });
      cancelled.delete(msg.jobId);
    }
  } catch (err) {
    postMessage({
      type: "error",
      jobId: msg.jobId,
      id: msg.id,
      during: msg.type,
      engine: msg.engine,
      message: String((err && err.message) || err),
    });
  }
};
