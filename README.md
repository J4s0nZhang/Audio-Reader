# Kokoro Reader

A small web app for iPhone that reads your text aloud with natural voices from the open-source [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) model. The model runs in the browser on your phone, so there's no server, no account, and no per-use cost.

- Paste text or import `.txt` / `.md` files. Documents are saved on the phone.
- Pick a voice (Heart is the best female voice) and tap **Make audio**.
- You can start listening as soon as the first part is ready.
- Finished audio plays with the screen locked and works with lock-screen controls.
- Markdown is cleaned up so headings, links and code blocks aren't read out as symbols.
- **Save audio** exports a `.wav` file to the Files app.

The first time you make audio, the app downloads the voice model (about 90 MB) and caches it. After that, it works offline.

## Put it on GitHub Pages

GitHub Pages is free for public repositories.

**Option A: from a terminal with the GitHub CLI**

```bash
cd kokoro-reader
gh repo create kokoro-reader --public --source=. --push
gh api -X POST repos/{owner}/kokoro-reader/pages -f "source[branch]=main" -f "source[path]=/"
```

**Option B: on github.com**

1. Create a new public repository named `kokoro-reader`.
2. Click **uploading an existing file** and drag in everything from this folder, including the `icons` folder.
3. Go to **Settings → Pages**, set the source to **Deploy from a branch**, choose `main` and `/ (root)`, and save.

After a minute or two, the app is live at `https://<your-username>.github.io/kokoro-reader/`.

## Use it on your iPhone

1. Open the link in Safari.
2. Tap **Share → Add to Home Screen** to use it like an app. The Home Screen app keeps its own library, separate from Safari.
3. Keep the screen on while audio is being made. Playback works with the screen locked.

## Speech engines

iPhone Safari gives web pages limited memory, and the standard ONNX runtime reserves up to 4 GB, which makes Safari kill the page. The default **Low memory** engine (`engines/lite.js`) avoids that:

- ONNX Runtime 1.21, CPU-only build (`engines/ort121/`), with its memory capped at 1 GB.
- Lighter model setup (basic graph optimization, no memory arena).
- Text is read in pieces of at most 180 characters, which keeps the engine at about 350 MB. Memory doesn't grow with document length, so long documents are fine.

Other engines are in Settings, and `diag.html` (Settings → **Test which engines work on this phone**) tries each one on the device.

The bundles in `engines/` are built from `kokoro-js` 1.2.1 with `@huggingface/transformers` 3.3.3 or 4.3.2 using esbuild.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | Library, editor, player and storage (IndexedDB) |
| `text.js` | Markdown cleanup and splitting text into parts Kokoro can read |
| `worker-core.js` | Speech-engine logic shared by the files in `engines/` |
| `engines/` | Kokoro bundled with different ONNX runtime versions; `engines/ort121/` is the patched low-memory runtime |
| `diag.html` | Engine test page |
| `sw.js` | Lets the app open offline |
