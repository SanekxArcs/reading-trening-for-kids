/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Читайко",
        short_name: "Читайко",
        description:
          "Reading practice for kids: read a text, answer questions, see speed and comprehension.",
        lang: "uk",
        theme_color: "#0f766e",
        background_color: "#f0fdfa",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The parent-only screens (settings, progress, the text library editor)
        // are never downloaded onto a child's tablet on first install; they are
        // fetched the first time a grown-up opens them, then kept.
        globIgnores: ["**/parent-*.js"],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/parent-[^/]+\.js$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "parent-screens" },
          },
        ],
        // Gemini is called directly from the page. The service worker must never
        // intercept or cache those POSTs: responses are large, one-shot, and
        // sometimes contain the child's audio.
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        /**
         * Split so a deploy re-downloads only what changed, and so the parent
         * screens never reach a child's install. Same reasoning as the math app.
         */
        manualChunks(id: string) {
          if (/\/src\/(settings|progress|library)\//.test(id)) return "parent";
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id))
            return "react";
          if (id.includes("node_modules/dexie")) return "dexie";
          if (id.includes("node_modules/motion")) return "motion";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Pure logic is the default. Files that need a DOM opt in with the
    // `@vitest-environment jsdom` docblock, exactly as in the math app.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
