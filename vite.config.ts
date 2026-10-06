import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `host: true` permite abrir el servidor de desarrollo desde el iPhone en la misma red.
export default defineConfig({
  plugins: [react()],
  server: { host: true },
});
