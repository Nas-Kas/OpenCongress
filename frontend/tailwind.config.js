/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1d4ed8',
          weak: '#eef2ff',
        },
        'vote-yea-bg': '#eaf8f0',
        'vote-yea-fg': '#15803d',
        'vote-nay-bg': '#fdeeee',
        'vote-nay-fg': '#b91c1c',
        'vote-present-bg': '#f2f4f7',
        'vote-present-fg': '#475467',
        'vote-nv-bg': '#fef6e7',
        'vote-nv-fg': '#92400e',
      },
    },
  },
  plugins: [],
}