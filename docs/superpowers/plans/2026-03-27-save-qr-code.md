# Save QR Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Save to Photos feature for the generated PayNow QR code using a hidden canvas and a Web Share / Download button fallback.

**Architecture:** We will replace the standalone `QRCodeSVG` with a hidden `QRCodeCanvas`. Once rendered, we extract its data URL to display an `<img>` tag. We add a Telegram UI `Button` to save/share the image.

**Tech Stack:** React, `@telegram-apps/telegram-ui`, `qrcode.react`, `lucide-react`

---

### Task 1: Update `PayNowQR` Component

**Files:**

- Modify: `apps/web/src/components/features/Chat/PayNowQR.tsx`

- [ ] **Step 1: Implement the hidden canvas and image rendering**
      Update imports to include `QRCodeCanvas`, `useRef`, `useState`, `useEffect`. Add state for `qrImageSrc` and a ref for the canvas. Generate the image on mount.

- [ ] **Step 2: Add the Save Button with Share/Download Logic**
      Import `Button` from `@telegram-apps/telegram-ui` and `Download` from `lucide-react`. Implement the `handleSave` function to use `navigator.share` or fallback to an `<a>` download. Add the button to the UI.

- [ ] **Step 3: Run linter and type-checker to verify**
      Run: `pnpm turbo lint` and `pnpm turbo check-types`
      Expected: PASS

- [ ] **Step 4: Commit**
      Commit the changes with message `feat: add save to photos button for PayNow QR`
