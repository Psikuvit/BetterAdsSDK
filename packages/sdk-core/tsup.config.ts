import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    headless: "src/headless.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
});
