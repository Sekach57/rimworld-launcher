import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared }
  },
  preload: {
    resolve: { alias: shared },
    build: {
      rolldownOptions: {
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].cjs' }
      }
    }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              { name: 'vendor-react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
              { name: 'vendor-dnd', test: /node_modules[\/]@dnd-kit[\/]/ }
            ]
          }
        }
      }
    }
  }
})
