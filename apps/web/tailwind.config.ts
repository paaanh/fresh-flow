import type { Config } from 'tailwindcss';
const config: Config = { content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'], theme: { extend: { colors: { brand: '#176b52', ink: '#18231f', cream: '#ffffff' }, fontFamily: { sans: ['Times New Roman', 'Times', 'serif'], serif: ['Times New Roman', 'Times', 'serif'] } } }, plugins: [] };
export default config;
