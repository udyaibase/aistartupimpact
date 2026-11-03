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
        brand: {
          DEFAULT: 'var(--brand-color, #FF3131)',
          50: '#FFF0F0',
          100: '#FFE0E0',
          200: '#FFC2C2',
          300: '#FF9494',
          400: '#FF5E5E',
          500: 'var(--brand-color, #FF3131)',
          600: '#E51A1A',
          700: '#C01010',
          800: '#9C1010',
          900: '#821414',
        },
        'brand-secondary': {
          DEFAULT: 'var(--brand-secondary, #1B3A5C)',
        },
        'brand-tertiary': {
          DEFAULT: 'var(--brand-tertiary, #F59E0B)',
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
        link: {
          DEFAULT: '#1B75E6',
          hover: '#1558B0',
          dark: '#60A5FA',
          'dark-hover': '#93C5FD',
        },
        page: {
          DEFAULT: '#F9FAFB',
          dark: '#030712',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          dark: '#111827',
        },
      },
      fontFamily: {
        sora: ['var(--font-sora)', 'sans-serif'],
        jakarta: ['var(--font-jakarta)', 'sans-serif'],
        bebas: ['var(--font-bebas)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },
      maxWidth: {
        article: '720px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      zIndex: {
        dropdown: '100',
        sticky: '200',
        overlay: '300',
        modal: '400',
        toast: '500',
        critical: '600',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        ticker: 'ticker 15s linear infinite',
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
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
