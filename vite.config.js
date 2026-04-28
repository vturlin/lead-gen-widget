import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Build produces a single artifact the hotelier embeds:
//   dist/widget.js   — self-contained IIFE that auto-mounts into
//                      #lead-widget and renders the popup.
//
// React + ReactDOM are bundled into widget.js. Hoteliers paste one
// <script> tag into their CMS (Wix/WordPress/bespoke); assuming a peer
// React install on an arbitrary marketing site is a footgun.
//
// Unlike the best-price widget, there is NO sibling widget.css —
// LeadGenWidget styles itself inline (CSS-in-JS), so the runtime
// contract is one fetch (widget.js) and zero stylesheet loads.
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/embed.jsx'),
      name: 'LeadGenWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
    cssCodeSplit: false,
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2018',
  },
  server: {
    port: 5174,
    open: '/demo.html',
  },
});
