# Clearcut

A local, browser-based tool for removing solid or smoothly varied backgrounds from images. Images stay in browser memory and are never uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open the localhost URL shown by Vite in current desktop Chrome.

## Use

1. Upload, drag and drop, or paste a PNG, JPEG, or WebP image.
2. Open **Advanced tools** only if the automatic result needs adjustment.
3. Adjust **Background sensitivity**, or choose **Add background sample** and click the background in the original preview.
4. Choose **Copy PNG** to paste into Canva, or **Download PNG**.

The app supports one image at a time, up to 20 MB and 4096 × 4096 pixels. It is designed for solid colors and smooth gradients with a clearly separated subject, not detailed or textured backgrounds.

## Verify

```bash
npm test
npm run lint
npm run build
```

### Manual Chrome-to-Canva checklist

- Start the app with `npm run dev` in current desktop Chrome.
- Paste a screenshot with a white background using Command-V.
- Confirm only the outer edge-connected background becomes transparent.
- Confirm enclosed white details remain visible.
- Adjust the tolerance and confirm the preview updates.
- Select a background manually and confirm the sample changes.
- Click **Copy PNG**, open a Canva design, and paste with Command-V.
- Confirm the image retains transparency and its original dimensions.
- Download the PNG and confirm it has the same transparent result.
- Reload the app and confirm the image was not retained.
