# Pitch Gauge

A transparent, always-on-top desktop overlay for measuring roof pitch from on-screen images.

## Features

- Drag the indicator along the semicircle arc to read pitch in X/12 format
- Rotate the baseline up to ±15° to match tilted photos
- Resize the window by dragging the resize button
- Adjustable arc fill opacity
- Show/hide with the Backtick `` ` `` global shortcut
- Optional launch-on-startup (starts hidden, reveal with shortcut)
- Auto-update: checks for a new version 3 seconds after launch

---

## Dev setup

**Prerequisites:** Node.js 18+, Rust (stable), Tauri CLI v2

```bash
npm install
```

### Run in dev mode

```bash
npm run dev
```

This starts Vite's dev server and opens the Tauri window with hot-reload.

> **Note:** The JS bundle (`src/bundle.js`) must be rebuilt whenever you change frontend source files when using `cargo tauri build` (not needed in dev mode — Vite handles it).

### Rebuild the JS bundle manually

```bash
npm run build:js
```

This produces `src/bundle.js` (esbuild bundles all imports for WebView2 compatibility).

---

## Building installers

### Windows — NSIS installer (`.exe`)

Build on a Windows machine:

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/nsis/Pitch Gauge_0.1.0_x64-setup.exe`

The installer runs without admin rights (current-user install mode).

### macOS — DMG (`.dmg`)

Build on a macOS machine:

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/dmg/Pitch Gauge_0.1.0_x64.dmg`

For a universal binary (Intel + Apple Silicon), build on macOS with both targets:

```bash
rustup target add aarch64-apple-darwin
npm run tauri build -- --target universal-apple-darwin
```

---

## OS warnings for unsigned builds

### Windows (SmartScreen)

The installer is unsigned. Windows will show a SmartScreen warning:
> "Windows protected your PC"

Click **More info → Run anyway** to proceed.

### macOS (Gatekeeper)

The app is unsigned (`signingIdentity: null`). macOS will block it on first launch:
> "Pitch Gauge can't be opened because Apple cannot check it for malicious software."

To open it:
1. Right-click the app → **Open**
2. Click **Open** in the dialog

Or run once in Terminal:
```bash
xattr -d com.apple.quarantine /Applications/Pitch\ Gauge.app
```

---

## Update mechanism

The app checks for updates 3 seconds after launch using [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/).

**Current endpoint placeholder:**
```
https://example.com/pitch-gauge/updates/{{target}}/{{arch}}/{{current_version}}
```

Replace this in `tauri.conf.json` → `plugins.updater.endpoints` before shipping.

### Releasing a new version

1. Bump `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`
2. Build installers on each platform (see above)
3. Sign each artifact with the minisign private key:
   ```bash
   # Windows
   npx tauri signer sign -k src-tauri/pitch-gauge.key "Pitch Gauge_x.y.z_x64-setup.exe"
   # macOS
   npx tauri signer sign -k src-tauri/pitch-gauge.key "Pitch Gauge_x.y.z_x64.dmg"
   ```
   Each command produces a `.sig` file alongside the artifact.
4. Upload the installers and `.sig` files to your hosting
5. Update the JSON response at your endpoint URL to point to the new version

**Update endpoint JSON format** (what your server must return):
```json
{
  "version": "0.2.0",
  "notes": "Bug fixes and improvements",
  "pub_date": "2026-01-01T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://example.com/releases/Pitch Gauge_0.2.0_x64-setup.exe",
      "signature": "<contents of .sig file>"
    },
    "darwin-x86_64": {
      "url": "https://example.com/releases/Pitch Gauge_0.2.0_x64.dmg",
      "signature": "<contents of .sig file>"
    },
    "darwin-aarch64": {
      "url": "https://example.com/releases/Pitch Gauge_0.2.0_aarch64.dmg",
      "signature": "<contents of .sig file>"
    }
  }
}
```

> **Keep `src-tauri/pitch-gauge.key` secret and out of version control.**  
> The `.gitignore` should exclude `*.key` files. Only the `.key.pub` file is safe to commit.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Backtick `` ` `` | Show / hide the overlay |
| Arrow Left / Right | Nudge pitch by 0.1/12 |
