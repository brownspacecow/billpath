/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        primary: '#1D4ED8',
        secondary: '#0F172A',
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
        neutral: '#64748B'
      }
    }
  },
  plugins: []
};
