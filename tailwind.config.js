/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'kiriku-teal': '#289EAB',
        'kiriku-teal-dark': '#1E7B85',
        'kiriku-teal-light': '#E8F6F8',
        'kiriku-orange': '#F58F38',
        'kiriku-orange-dark': '#D47422',
        'kiriku-orange-light': '#FEF4EC',
        'kiriku-coral': '#EB455F',
        'kiriku-coral-dark': '#C9334B',
        'kiriku-coral-light': '#FDECEF',
        'kiriku-navy': '#1E4867',
      },
    },
  },
  plugins: [],
};
