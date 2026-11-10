/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // พาเลตต์ตามไฟล์ Code color ที่แนบมากับดีไซน์
      colors: {
        primary: { DEFAULT: '#00ADB0', dark: '#008C8F', wash: '#E6F7F7', soft: '#B9E8E8' },
        ink: '#193B44',
        slate: '#31525B',
        muted: '#71787A',
        line: '#EEEEEE',
        page: '#F4F3F4',
        gold: { DEFAULT: '#FFA101', wash: '#FFF3DF', ink: '#673E00' },
        danger: { DEFAULT: '#BA1A1A', wash: '#FDECEC' },
        success: { DEFAULT: '#2D7D46', wash: '#E8F5EC' },
        violet: '#9B72CF',
        sky: '#A2C4CF',
      },
      fontFamily: {
        sans: ['Anuphan', '"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { card: '12px', pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(25,59,68,.04), 0 6px 20px -14px rgba(25,59,68,.35)',
        pop: '0 12px 40px -12px rgba(25,59,68,.35)',
      },
      maxWidth: { mobile: '480px' },
    },
  },
  plugins: [],
};
