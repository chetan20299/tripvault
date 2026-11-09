const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#EEF7FA', 100: '#D3EBF2', 200: '#A6D6E4', 400: '#3E9DBB', 500: '#167A9C', 600: '#0B4F6C', 700: '#093F57', 900: '#06293A' },
        accent: { 400: '#FBBF24', 500: '#F59E0B', 600: '#D97706' },
        bg: v('bg'), surface: v('surface'), elevated: v('elevated'), ink: v('ink'), muted: v('muted'), line: v('line'),
      },
      boxShadow: { card: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.06)' },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
    },
  },
  plugins: [],
};
