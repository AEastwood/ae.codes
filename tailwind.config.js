/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  darkMode: "media",

  plugins: [],

  theme: {
    extend: {
      colors: {
        'google': '#202124'
      },
      fontFamily: {
        sans: ['Recoleta', 'sans-serif'],
      },
    },
  },
}

