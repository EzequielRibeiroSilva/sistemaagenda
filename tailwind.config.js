/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        genty: ['Genty', 'sans-serif'],
      },
      colors: {
        saida: '#F97315', // Cor padrão Tally para valores negativos/saídas
      },
    },
  },
  plugins: [],
}
