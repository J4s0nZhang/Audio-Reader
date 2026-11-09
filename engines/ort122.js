// The original build (ONNX Runtime 1.22), loaded from the CDN.
import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
import { startWorker } from "../worker-core.js";
startWorker({ KokoroTTS, name: "ort122" });
