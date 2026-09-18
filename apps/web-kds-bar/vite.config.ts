import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/kds-bar/',
  plugins: [react()],
  server: { port: 5175, host: true },
});
