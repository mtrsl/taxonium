# Electron icon pack

All icon files are square. The supplied black line-art logo was kept intact and centered on transparent padding; no background color was added.

## Files

- `assets/macos/icon.icns` — macOS icon with standard and high-density representations through 1024 × 1024.
- `assets/windows/icon.ico` — Windows icon with 16, 24, 32, 48, 64, 128, and 256 pixel images.
- `assets/linux/icon.png` — Linux icon at 512 × 512.
- `assets/png/icon.png`, `icon@2x.png`, `icon@3x.png` — reusable PNGs at 512, 1024, and 1536 pixels. Electron recognizes the density suffixes.

## Electron Forge paths

For macOS or Windows, set `packagerConfig.icon` to the platform-specific icon path without the extension, for example:

```js
packagerConfig: {
  icon: './assets/macos/icon' // use ./assets/windows/icon for Windows
}
```

For Linux, use `./assets/linux/icon.png` in the maker configuration and as the `BrowserWindow` `icon` path, as described in the Electron Forge icon guide.

The current Electron Forge guide also describes an Icon Composer `.icon` file for macOS 26 and later. This pack includes the compatible `.icns` asset; creating the additional `.icon` asset requires Apple's `actool` on macOS 26/Xcode 26.
