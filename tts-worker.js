// Runs Kokoro in a background thread. The page may start several of these to use more CPU cores.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
let tts = null;

self.onmessage = async ({ data: m }) => {
  try {
    if (m.type === "load") {
      const opts = m.device === "webgpu" ? { device: "webgpu", dtype: "fp32" } : { device: "wasm", dtype: "q8" };
      const files = {};
      tts = await KokoroTTS.from_pretrained(MODEL_ID, {
        ...opts,
        progress_callback: (p) => {
          if (p.status !== "progress" || !p.file) return;
          files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
          let loaded = 0, total = 0;
          for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
          postMessage({ type: "progress", loaded, total });
        },
      });
      // A first run compiles everything, so later timing is meaningful (and a broken GPU fails here).
      await tts.generate("Ready.", { voice: "af_heart" });
      postMessage({ type: "loaded" });
    } else if (m.type === "synth") {
      const t0 = performance.now();
      let audio;
      try {
        audio = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      } catch (err) {
        // Retry once with plain characters; an odd symbol shouldn't stop a whole book.
        audio = await tts.generate(m.text.replace(/[^\p{L}\p{N}\s.,!?;:'"()-]/gu, " "), { voice: m.voice, speed: m.speed });
      }
      const samples = new Float32Array(audio.audio);
      postMessage({ type: "audio", id: m.id, samples, rate: audio.sampling_rate, ms: performance.now() - t0 }, [samples.buffer]);
    }
  } catch (err) {
    postMessage({ type: "error", id: m.id, during: m.type, message: String((err && err.message) || err) });
  }
};
