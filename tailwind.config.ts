import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    borderRadius: { none: '0', DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0', '2xl': '0', full: '9999px' },
    boxShadow: { none: 'none', sm: 'none', DEFAULT: 'none', md: 'none', lg: 'none', xl: 'none' },
    extend: {
      colors: {
        canvas: '#fafaf8',
        surface: '#f2f1ee',
        paper: '#ffffff',
        ink: {
          DEFAULT: '#0a0a09', 100: '#f2f1ee', 200: '#dcdbd7', 300: '#c4c3bf',
          400: '#a8a7a2', 500: '#8a8983', 600: '#6b6a65', 700: '#4a4945',
          800: '#2e2d2a', 900: '#1a1917', 950: '#0f0e0c',
        },
        body: '#4a4945',
        muted: '#72706a',
        hairline: '#dcdbd7',
        'hairline-hi': '#c4c3bf',
        background: '#fafaf8',
        foreground: '#0a0a09',
        gain: '#356a45',   // engraved green — USDC/gains, numbers only
        loss: '#a32b22',   // engraved red — errors/losses, numbers only
      },
      fontFamily: {
        serif: ['var(--font-garamond)', 'EB Garamond', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'Geist Mono', 'ui-monospace', 'monospace'],
      },
      letterSpacing: { label: '0.08em', display: '-0.03em' },
      transitionTimingFunction: { vellum: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
