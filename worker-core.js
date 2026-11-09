// Shared speech-engine worker logic. Each file in engines/ wires this up to a
// different build of the ONNX runtime, because iPhone Safari is picky about which ones it can run.

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

export function startWorker({ KokoroTTS, configure, name }) {
  let tts = null;
  let loadedKey = null;
  let loading = null;
  const cancelled = new Set();

  async function load(device) {
    const opts = device === "webgpu" ? { device: "webgpu", dtype: "fp32" } : { device: "wasm", dtype: "q8" };
    const key = opts.device + ":" + opts.dtype;
    if (tts && loadedKey === key) return tts;
    if (loading && loading.key === key) return loading.promise;

    const promise = (async () => {
      configure?.(opts.device);
      const files = {};
      let downloaded = false;
      postMessage({ type: "phase", phase: "download", engine: name });
      const model = await KokoroTTS.from_pretrained(MODEL_ID, {
        ...opts,
        progress_callback: (p) => {
          if (p.status === "progress" && p.file) {
            files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
            let loaded = 0, total = 0;
            for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
            postMessage({ type: "load-progress", loaded, total, file: p.file });
          } else if (p.status === "done" && /\.onnx$/.test(p.file || "") && !downloaded) {
            downloaded = true;
            postMessage({ type: "phase", phase: "init", engine: name });
          }
        },
      });
      postMessage({ type: "phase", phase: "ready", engine: name, mem: globalThis.__ortMem?.buffer.byteLength });
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
    return { samples: new Float32Array(audio.audio), rate: audio.sampling_rate };
  }

  self.onmessage = async (e) => {
    const msg = e.data;
    try {
      if (msg.type === "load") {
        const t0 = performance.now();
        await load(msg.device);
        postMessage({ type: "loaded", engine: msg.engine, ms: performance.now() - t0 });
      } else if (msg.type === "cancel") {
        cancelled.add(msg.jobId);
      } else if (msg.type === "preview") {
        await load(msg.device);
        const t0 = performance.now();
        const { samples, rate } = await synth(msg.text, msg.voice, msg.speed);
        postMessage({ type: "preview", id: msg.id, samples, rate, ms: performance.now() - t0, mem: globalThis.__ortMem?.buffer.byteLength }, [samples.buffer]);
      } else if (msg.type === "generate") {
        await load(msg.device);
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
            { type: "chunk", jobId: msg.jobId, i: chunk.i, samples: out.samples, rate: out.rate, skipped, ms: performance.now() - t0, mem: globalThis.__ortMem?.buffer.byteLength },
            [out.samples.buffer],
          );
        }
        postMessage({ type: "done", jobId: msg.jobId, cancelled: cancelled.has(msg.jobId) });
        cancelled.delete(msg.jobId);
      }
    } catch (err) {
      postMessage({
        type: "error", jobId: msg.jobId, id: msg.id, during: msg.type, engine: msg.engine,
        message: String((err && err.message) || err),
      });
    }
  };
  postMessage({ type: "phase", phase: "started", engine: name });
}
