import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/adapters/max/index.ts',
    'src/adapters/mock/index.ts',
    'src/adapters/production/index.ts',
    'src/adapters/reference-adapter/index.ts',
    'src/adapters/telegram/index.ts',
  ],
  format: ['esm', 'cjs'],
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  outExtension({ format }) {
    return format === 'cjs' ? { js: '.cjs' } : { js: '.js' };
  },
});
