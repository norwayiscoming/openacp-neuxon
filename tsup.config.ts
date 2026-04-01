import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  bundle: true,
  splitting: false,
  sourcemap: true,
  dts: true,
  clean: true,
  external: ["@openacp/cli", "sql.js", "@xenova/transformers"],
  noExternal: [/.*/],
  esbuildOptions(options) {
    options.resolveExtensions = [".ts", ".js", ".mjs"];
  },
});
