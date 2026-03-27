# Save QR Code to Photos

## Overview

A feature to allow users to easily save the generated PayNow QR code to their device's photo album. Because Telegram Mini Apps are loaded in an embedded webview, standard browser downloads can be inconsistent across iOS and Android.

To ensure the best user experience, we will provide a dual-approach:

1. Render the QR code as a standard `<img>` tag (via a hidden `QRCodeCanvas`), which allows iOS users to natively long-press the image and select "Save to Photos".
2. Provide a prominent "Save QR Code" button that explicitly triggers a save/share action.

## Component Architecture

**Target File:** `apps/web/src/components/features/Chat/PayNowQR.tsx`

We will update the `PayNowQR` component to:

1. Replace the currently rendered `QRCodeSVG` with a dual setup: a visually hidden `QRCodeCanvas` and a visible `<img>`.
2. Extract the Data URL (PNG representation) of the rendered `QRCodeCanvas` and bind it to the `src` attribute of the `<img>`.
3. Add a `Button` from `@telegram-apps/telegram-ui` below the image, equipped with a `Download` icon from `lucide-react`.

## Data Flow & Implementation Details

### Image Generation

- Use `useRef<HTMLCanvasElement>` to access the hidden `QRCodeCanvas`.
- In a `useEffect` (triggered after the canvas renders), call `canvas.toDataURL("image/png")` to generate a base64 PNG string.
- Store this string in a state variable (`qrImageSrc`).

### Save/Share Logic

When the user clicks the "Save QR Code" button, the following logic will execute:

1. **Convert to File:**

   - Convert the base64 `qrImageSrc` string to a `Blob`, and then to a `File` object (e.g., `paynow-merchantName.png`).

2. **Primary Flow (Web Share API):**

   - Check if `navigator.share` and `navigator.canShare({ files: [file] })` are supported.
   - If supported, invoke `navigator.share` with the generated `File`. This reliably brings up the native OS share sheet where the user can choose "Save Image".

3. **Fallback Flow (Standard Download):**
   - If `navigator.share` is unavailable or fails, fall back to creating a temporary `<a>` element.
   - Set `a.href = qrImageSrc` and `a.download = "paynow-[merchantName].png"`.
   - Programmatically click the `<a>` element to trigger a standard HTML5 download.

## Dependencies

- **`qrcode.react`**: For rendering the `QRCodeCanvas`.
- **`lucide-react`**: For the `Download` icon.
- **`@telegram-apps/telegram-ui`**: For the `Button` UI component to ensure styling consistency with the Telegram Mini App.

## Error Handling & Feedback

- If image generation or saving fails (e.g., due to memory constraints or unsupported browser APIs), we should ideally catch the error and perhaps use `hapticFeedback` from the Telegram SDK to signal a failure (if applicable), or simply fail gracefully (the long-press option remains available).
