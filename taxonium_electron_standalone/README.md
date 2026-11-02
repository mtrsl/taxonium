# BigTree desktop application

BigTree packages the Taxonium local-file website in an Electron desktop window. Dataset files are read by the same browser workers as the website. The Electron main process serves the built renderer over a random port bound to `127.0.0.1`; it does not expose file paths or process APIs to the renderer.

Platform icons come from the repository-level `electron-icon-pack/`: macOS uses its ICNS for the app and DMG plus its PNG for the runtime Dock icon, Windows uses its ICO, and Linux uses its PNG for the package and application window. Keep that icon pack alongside this directory when building or packaging.

## Prerequisites

- Node.js 24 LTS and npm 11 or newer.
- Git checkout with the sibling `taxonium_component/` and `taxonium_website/` packages.
- For Linux development, a desktop session with working GPU support. CI uses Xvfb for headless smoke checks.

Install all three packages from the repository root, keeping the sibling directory layout:

```sh
npm --prefix taxonium_component ci
npm --prefix taxonium_website ci --ignore-scripts
npm --prefix taxonium_electron_standalone ci
```

The website's install hook would rebuild the component with a separate heap limit. Skipping that hook here avoids duplicate work; the desktop build below builds the component explicitly with its required Node.js heap allowance. Keep the repository-level `electron-icon-pack/` alongside these packages.

## Development

From `taxonium_electron_standalone/`, run:

```sh
npm run build:component
npm run dev
```

This starts Vite for the website source and opens Electron after Vite is ready. Both processes stop together. Website edits reload through Vite; after editing the reusable component, rerun `npm run build:component` to refresh its bundle. The browser-based website remains available through its regular Vite and production build commands.

## Checks and builds

```sh
npm run check-types
npm --prefix ../taxonium_component test -- --run
npm test
npm run build
```

`npm run build` builds the component, creates a desktop renderer in `renderer/`, and makes an unpacked BigTree application for the current platform. It allows the large component bundle the extra Node.js heap it needs. `npm run dist` creates the current platform’s distributable package. Platform-specific commands are available as `npm run package:mac:arm64`, `npm run package:mac:x64`, `npm run package:win`, and `npm run package:linux`. Use a native macOS runner for each macOS architecture, Windows for Windows, and Linux for Linux.

Build outputs are written to `dist/` and can be run without starting a development server. The macOS targets are DMG and ZIP, Windows uses an NSIS installer, and Linux uses AppImage.

For an unpacked build, open `dist/mac-arm64/BigTree.app` on Apple Silicon, run `dist/win-unpacked/BigTree.exe` on Windows, or run `dist/linux-unpacked/bigtree` on Linux. For a distributable, open the DMG or ZIP on macOS, run the NSIS installer on Windows, or mark the AppImage executable and launch it on Linux.

## Unsigned builds and platform limitations

Builds are unsigned. macOS may show Gatekeeper’s unidentified developer warning; users can open BigTree from Finder using **Open** in the contextual menu. Windows may show SmartScreen, and Linux may require marking the AppImage executable. These prompts are expected until platform signing and notarisation are configured.

The initial interactive package validation targets Apple Silicon. GitHub Actions builds and smoke-launches macOS arm64/x64, Windows x64 and Linux x64. BigTree’s local file loading and visualisations work without network access; the geographic map needs its existing OpenFreeMap tile service connection. No automatic updates or file associations are configured.

## Platform packages and CI

From this directory, generate unsigned distributables with:

```sh
npm run package:mac:arm64
# On native runners for the other targets:
npm run package:mac:x64
npm run package:win
npm run package:linux
```

The macOS arm64 outputs include `dist/BigTree-1.0.0-arm64.dmg`, `dist/BigTree-1.0.0-arm64-mac.zip` and `dist/mac-arm64/BigTree.app` (versioned filenames follow `package.json`). The DMG/ZIP contain a standalone application; no Vite server or Node.js installation is needed to run it. Verify an unpacked build using `npm run smoke:packaged`. In headless Linux CI, use `xvfb-run -a npm run smoke:packaged`.

The existing [BigTree desktop build workflow](../.github/workflows/bigtree-electron.yml) runs on `v*.*.*` tag pushes. It tests the component, builds and smoke-tests the native macOS arm64/x64, Windows x64 and Linux x64 applications, and uploads unsigned artifacts. UI-01 retains these triggers and platform targets. Local checks do not replace native CI validation of the other operating systems or confirmation of release uploads.

Use the normal native GPU settings when checking the packaged macOS app. Forcing software WebGL flags can leave its tree canvas unavailable on some macOS/Electron combinations. A successful canvas-element check alone does not confirm that a tree rendered: inspect the tree and exercise its controls. The map retains an online OpenFreeMap country-outline basemap with provider attribution and falls back to a plain background when tiles are unavailable.
