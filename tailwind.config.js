/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'forest-green': '#2D5A27',
        'treasure-gold': '#FFB703',
        'smoke-white': '#F8F9FA',
      },
    },
  },
  plugins: [],
}