import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: '#176b52',
        ink: '#18231f',
        cream: '#ffffff',
      },
      fontFamily: {
        sans: [
          'Plus Jakarta Sans',
          'Be Vietnam Pro',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'Noto Sans',
          'sans-serif',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
          'Noto Color Emoji',
        ],
        serif: [
          'Plus Jakarta Sans',
          'Be Vietnam Pro',
          'Lora',
          'Merriweather',
          'serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
