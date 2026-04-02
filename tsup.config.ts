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
  external: ["@openacp/cli", "sql.js", "@xenova/transformers", "onnxruntime-node", "sharp"],
  noExternal: ["hono", "@hono/node-server", "nanoid", "zod", "@dagrejs/dagre"],
  esbuildOptions(options) {
    options.resolveExtensions = [".ts", ".js", ".mjs"];
  },
});
