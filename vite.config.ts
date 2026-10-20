import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  /* GitHub Pages serves the site from /<repo>/, so the base path has to be
     supplied at build time: BASE_PATH=/cobot-arm/ npm run build */
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          motion: ["gsap", "lenis"],
        },
      },
    },
  },
});
