import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/utils/src/**/*.tsx',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // The admin accent. Values live in app/globals.css as CSS variables, so the calm admin colour and the public
        // site's red (used only inside previews of public pages) come from one place.
        brand: {
          DEFAULT: 'rgb(var(--brand-500) / <alpha-value>)',
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
        // Dark mode surfaces: soft slate instead of near-black, which glares against white text over long sessions.
        gray: {
          800: '#232B36',
          900: '#161C24',
          950: '#0E1319',
        },
        navy: {
          DEFAULT: '#0D1B2A',
          50: '#E8EDF2',
          100: '#C7D2DF',
          200: '#97ABBD',
          300: '#6A849D',
          400: '#3D5D7D',
          500: '#1B3A5C',
          600: '#142D4A',
          700: '#0F2239',
          800: '#0D1B2A',
          900: '#08111B',
        },
        charcoal: '#2C2C2C',
      },
      // Smallest label size is 13px (Tailwind's default "xs" is 12px); see globals.css for the 12px floor on badges.
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
      },
      // A data tool reads better with bold than with extra-bold headings.
      fontWeight: {
        extrabold: '700',
      },
      fontFamily: {
        sora: ['var(--font-sora)', 'sans-serif'],
        jakarta: ['var(--font-jakarta)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      maxWidth: {
        article: '720px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        ticker: 'ticker 30s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        ticker: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
