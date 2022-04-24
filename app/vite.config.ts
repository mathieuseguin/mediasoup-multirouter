import { readFileSync } from 'fs'
import { defineConfig } from 'vite'

import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
const baseConfig = defineConfig({
  plugins: [react()]
})


export default {
  ...baseConfig,
  server: {
    https: {
      key: readFileSync('../certs/domain.key'),
      cert: readFileSync('../certs/domain.crt'),
    },
    port: 3000,
  },
};
