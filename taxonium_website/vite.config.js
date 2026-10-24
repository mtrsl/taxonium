import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "desktop" ? "/" : undefined,
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "desktop" ? [{
      name: "bigtree-desktop-html",
      transformIndexHtml(html) {
        return html
          .replace(/\s*<!-- Global site tag \(gtag\.js\)[\s\S]*?gtag\(["']config["'],\s*["']G-TDTSH11X4S["']\);\s*<\/script>\s*/i, "\n")
          .replace(/<link\b(?=[^>]*href="https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^"]*")[^>]*>/gi, "")
          .replace("<title>Taxonium</title>", "<title>BigTree</title>");
      },
    }] : []),
  ],
  build: mode === "desktop" ? {
    outDir: "../taxonium_electron_standalone/renderer",
    emptyOutDir: true,
  } : undefined,
}));
