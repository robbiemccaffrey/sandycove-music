/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          800: '#1a2332',
          900: '#0f1923',
          950: '#0a1118',
        },
        gold: {
          400: '#d4a843',
          500: '#c9952e',
          600: '#b8841f',
        },
      },
    },
  },
  plugins: [],
};
