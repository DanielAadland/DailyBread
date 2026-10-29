import { defineConfig } from 'vitest/config';

// Unit tests for plain TypeScript helpers in src/lib and src/api. UI is checked in the browser.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
