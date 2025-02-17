/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'nato-blue': '#004990',
                'nato-accent': '#FFB612',
                'nato-gray': '#2C3E50',
            },
            fontFamily: {
                sans: ['Inter var', 'sans-serif'],
            }
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
    ],
}; 