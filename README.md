# Audiobook Maker

Turns documentation (Markdown or plain text) or a **novel PDF** into an **.m4b audiobook with chapters**, read by natural voices from the open-source [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) model. It runs entirely in your computer's browser: nothing is uploaded or saved.

**Use it on a computer** in Chrome or Edge. Then put the `.m4b` on your phone and listen in Apple Books or BookPlayer.

## How it works

1. **Add documentation.** Drop `.md` / `.txt` files or a whole folder, or paste text.
2. **Chapters.** Each file becomes a chapter; a single file is split at its main headings. You can rename, reorder, merge, or remove chapters, and see exactly what will be read. Markdown is cleaned up (code blocks, links, and symbols aren't read aloud).
3. **Voice.** Pick a voice and speed, and play a sample read from your own text.
4. **Create.** The audiobook is generated, encoded to AAC as it goes (memory stays flat for long books), and packaged as one `.m4b` with chapter markers, title, author, and a generated cover.

The speech engine uses your graphics card through WebGPU when available, which is much faster. Otherwise it uses several processor threads. The first run downloads the voice model (about 330 MB for the graphics card, 90 MB for the processor), and the browser caches it after that.

## Novel PDFs

Drop a PDF and the page reads its layout to work out what to read:

- **Skips** illustration pages, chapter title pages, the table of contents, blank pages, front matter (title and credits pages), running headers, page numbers, and footnotes.
- **Finds chapters** from the PDF's bookmarks if it has them; otherwise from chapter title pages and large headings, section headers like "Afterword", or "Chapter 1" / "Prologue" lines. If the book has a contents page, the result is checked against it.
- **Rebuilds the prose**: joins lines, undoes hyphenation and soft hyphens, continues paragraphs across page breaks (and across illustrations), and turns scene-break markers into pauses.
- Uses the PDF's **cover page** as the audiobook cover.

The review screen shows each chapter's page range and exactly what will be read, plus which pages were skipped and why. PDFs that are scanned images (no text layer) aren't supported.

## Getting the file onto your iPhone

Save the `.m4b` to iCloud Drive or Google Drive, or email it to yourself. On the iPhone, open it in the Files app, tap Share, and choose Books or BookPlayer.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout and styles |
| `app.js` | Input, chapter editing, voice selection, and the conversion pipeline |
| `text.js` | Markdown cleanup, splitting text into speakable pieces, and chapter detection |
| `tts-worker.js` | Runs Kokoro (`kokoro-js` 1.2.1) in background threads |
| `pdfbook.js` | Novel PDF analysis: page types, headers/footers, chapters, paragraphs, cover |
| `lib/pdfjs/` | PDF.js 4.10.38 (Apache 2.0) |
| `audiobook.js` | AAC encoding and `.m4b` packaging with chapters, using ffmpeg compiled to WebAssembly |
| `lib/ffmpeg/` | The `@ffmpeg/ffmpeg` 0.12.15 loader (MIT). The ffmpeg core itself loads from jsDelivr. |
| `sw.js` | Removes the offline cache left by an earlier version of this site |
