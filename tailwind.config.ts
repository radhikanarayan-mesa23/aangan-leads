import type { Config } from 'tailwindcss';

// Design tokens live in app/globals.css as CSS variables.
// Swapping in a new design file = editing those variables, not this file.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        navy: 'var(--navy-900)',
        'blue-brand': 'var(--blue-500)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        accent: 'var(--accent)',
        hot: 'var(--hot)',
        warm: 'var(--warm)',
        low: 'var(--low)',
        escalate: 'var(--escalate)',
        ok: 'var(--ok)',
      },
      borderRadius: { card: 'var(--radius)', chip: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(16,15,14,0.04)',
        pop: '0 8px 28px rgba(16,15,14,0.10)',
      },
      fontFamily: { sans: ['var(--font-sans)'] },
    },
  },
  plugins: [],
} satisfies Config;
