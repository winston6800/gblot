# Handwrite to Text

Write a word on the pad with a mouse, trackpad, stylus or finger. It's read **as you
write** — stroke by stroke — and drops into the document when you pause.

## Run it

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. Serve it over `http://`; opening `index.html` as a
`file://` path will not work.

## How the recognition works

This uses **online (stroke-based) handwriting recognition**, not OCR.

The difference matters. OCR engines like Tesseract read a flattened *image* and are
trained on printed type — they're unreliable on handwriting, especially cursive.
Stroke-based recognition instead reads the **pen path over time**: where each stroke
starts and ends, its direction, order and speed. That's the same class of technique
behind Google Handwriting Input and iPad Scribble, and it's what makes live,
as-you-write reading possible — the payload is a few hundred coordinates rather than
an image, so a round trip is fast enough to run after every stroke.

Recognition is served by Google's handwriting endpoint (`inputtools.google.com`).
**Your stroke coordinates are sent there to be read**, so this is not an offline tool.

## If recognition never returns

The app calls the recognition endpoint directly from the browser. If your browser
blocks that request, run the bundled proxy:

```bash
node proxy.js
```

Then add this line to `index.html`, immediately above `<script src="script.js">`:

```html
<script>window.RECOGNIZER_URL = 'http://localhost:8787/recognize';</script>
```

## Using it

- **Write** a word on the pad — it's read after each stroke and shown live.
- **Pause** for about 1.5s and the word is added to the document.
- **Pick an alternative** from the chips under the live word if the first guess is wrong.
- **Undo stroke** removes the last stroke and re-reads; **Clear pad** discards the word.
- The document is an ordinary editable text box — fix anything by typing.

Timings live at the top of `script.js` (`RECOGNIZE_DEBOUNCE_MS`, `COMMIT_IDLE_MS`).
