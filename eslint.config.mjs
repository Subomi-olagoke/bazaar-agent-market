// eslint.config.mjs — Next.js 16 dropped the built-in `next lint` command, so ESLint
// needs its own flat config here (there was none before; `npm run lint` was broken).
// eslint-config-next already ships a flat config array — no FlatCompat wrapper needed.
import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
];

export default config;
