import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "github-pages",
  base: process.env.VITE_BASE_PATH ?? "/Outreach/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules\/(react|react-dom|scheduler)\// },
            { name: "supabase", test: /node_modules\/@supabase\// },
            { name: "icons", test: /node_modules\/lucide-react\// },
            { name: "ui", test: /node_modules\/(@base-ui|radix-ui)\// },
          ],
        },
      },
    },
  },
});
