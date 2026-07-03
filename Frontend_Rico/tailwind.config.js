/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./App.tsx", "./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins_400Regular"],
      },
      colors: {
        primary: "#AFEEEE",
        secondary: "#ADEBB3",
        background: "#fbfbfe",
        text: "#2A2A2A",
      },
    },
  },
  plugins: [],
}