// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: [
        "three",
        "@react-three/fiber",
        "@react-three/drei",
      ],
    },
    ssr: {
      noExternal: ["three", "@react-three/fiber", "@react-three/drei"],
    },
  },

  adapter: cloudflare(),
});