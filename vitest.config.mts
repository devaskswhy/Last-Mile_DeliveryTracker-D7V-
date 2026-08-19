import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The `@/*` alias is declared in tsconfig for the editor and the Next build;
  // Vitest resolves modules itself, so it needs the same mapping stated here.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // The rate engine is pure and server-side — no DOM, no setup file.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
