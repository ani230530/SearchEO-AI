import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  cacheDir: ".vite-cache",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Vite eagerly modulepreloads the static deps of dynamically-imported
    // chunks by default. That re-introduces the bundle we just split out
    // (chart-vendor etc. get fetched at first paint even though no eager
    // code uses them). Filter those out — they're cheap to fetch when the
    // user actually clicks the lazy route, and keeping them off the cold
    // path saves ~150–200 KB gzip on first load.
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (d) =>
            !d.includes('chart-vendor') &&
            !d.includes('pdf-vendor') &&
            !d.includes('markdown-vendor') &&
            !d.includes('editor-vendor'),
        ),
    },
    // Per-vendor chunks so a chart bump doesn't bust the markdown cache, etc.
    // Each chunk is cache-keyed independently by the browser; on a deploy that
    // only changes app code, only the app chunk re-downloads.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query-vendor': ['@tanstack/react-query', '@tanstack/react-table'],
          'ui-vendor': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-aspect-ratio',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          'chart-vendor': ['recharts', 'd3'],
          'markdown-vendor': ['react-markdown', 'remark-gfm'],
          'pdf-vendor': ['@react-pdf/renderer'],
          'editor-vendor': ['quill', 'react-quill'],
        },
      },
    },
    // We split aggressively now; warn only on chunks >300 KB.
    chunkSizeWarningLimit: 300,
  },
}));
