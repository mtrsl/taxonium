# BigTree desktop application

BigTree packages the Taxonium local-file website in an Electron desktop window. Dataset files are read by the same browser workers as the website. The Electron main process serves the built renderer over a random port bound to `127.0.0.1`; it does not expose file paths or process APIs to the renderer.

Platform icons come from the repository-level `electron-icon-pack/`: macOS uses its ICNS for the app and DMG plus its PNG for the runtime Dock icon, Windows uses its ICO, and Linux uses its PNG for the package and application window. Keep that icon pack alongside this directory when building or packaging.

## Prerequisites

- Node.js 24 LTS and npm 11 or newer.
- Git checkout with the sibling `taxonium_component/` and `taxonium_website/` packages.
- For Linux development, a desktop session with working GPU support. CI uses Xvfb for headless smoke checks.

Install dependencies and build the reusable component first:

```sh
cd taxonium_component
npm ci
npm run build
```

Then install the website and Electron dependencies:

```sh
cd ../taxonium_website
npm ci
cd ../taxonium_electron_standalone
npm ci
```

## Development

From `taxonium_electron_standalone/`, run:

```sh
npm run dev
```

This starts Vite for the website source and opens Electron after Vite is ready. Both processes stop together. The browser-based website remains available through its regular Vite and production build commands.

## Checks and builds

```sh
npm run check-types
npm test
npm run build
```

`npm run build` builds the component, creates a desktop renderer in `renderer/`, and makes an unpacked BigTree application for the current platform. It allows the large component bundle the extra Node.js heap it needs. `npm run dist` creates the current platform’s distributable package. Platform-specific commands are available as `npm run package:mac:arm64`, `npm run package:mac:x64`, `npm run package:win`, and `npm run package:linux`. Use a native macOS runner for each macOS architecture, Windows for Windows, and Linux for Linux.

Build outputs are written to `dist/` and can be run without starting a development server. The macOS targets are DMG and ZIP, Windows uses an NSIS installer, and Linux uses AppImage.

For an unpacked build, open `dist/mac-arm64/BigTree.app` on Apple Silicon, run `dist/win-unpacked/BigTree.exe` on Windows, or run `dist/linux-unpacked/bigtree` on Linux. For a distributable, open the DMG or ZIP on macOS, run the NSIS installer on Windows, or mark the AppImage executable and launch it on Linux.

## Unsigned builds and platform limitations

Builds are unsigned. macOS may show Gatekeeper’s unidentified developer warning; users can open BigTree from Finder using **Open** in the contextual menu. Windows may show SmartScreen, and Linux may require marking the AppImage executable. These prompts are expected until platform signing and notarisation are configured.

The initial interactive package validation targets Apple Silicon. GitHub Actions builds and smoke-launches macOS arm64/x64, Windows x64 and Linux x64. BigTree’s local file loading and visualisations work without network access; the geographic map needs its existing OpenFreeMap tile service connection. No automatic updates or file associations are configured.
