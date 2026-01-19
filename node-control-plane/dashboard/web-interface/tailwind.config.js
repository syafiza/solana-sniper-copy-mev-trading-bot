/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'discord-bg': '#36393f',
                'discord-dark': '#2f3136',
                'terminal-green': '#00ff41',
            },
        },
    },
    plugins: [],
}
