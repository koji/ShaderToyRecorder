import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest.json";

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    plugins: [react(), crx({ manifest })],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    build: {
      // Generate source maps for debugging but keep them separate for security
      sourcemap: isProduction ? "hidden" : true,

      // Optimize build size
      minify: isProduction ? "terser" : false,
      ...(isProduction && {
        terserOptions: {
          compress: {
            // Remove console logs in production
            drop_console: true,
            drop_debugger: true,
            // Remove unused code
            dead_code: true,
          },
          mangle: {
            // Preserve function names for debugging
            keep_fnames: false,
            // Preserve class names for debugging
            keep_classnames: false,
          },
          format: {
            // Remove comments
            comments: false,
          },
        },
      }),

      // Set target for Chrome extension compatibility
      target: ["chrome89", "edge89"],

      // Optimize asset handling
      assetsInlineLimit: 4096, // Inline small assets
    },

    // Define environment variables
    define: {
      __DEV__: !isProduction,
      __PROD__: isProduction,
    },
  };
});
