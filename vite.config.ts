import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: Object.fromEntries(
      ['middleware', 'controller', 'router', 'lib', 'service', 'repository', 'prisma/db'].map(name => [
        `@${name}`,
        fileURLToPath(new URL(`./src/${name}`, import.meta.url)),
      ]),
    ),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
