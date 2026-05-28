// Medica brand tokens — extend your Tailwind config with this object
// Usage: spread into theme.extend in your tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './public/**/*.html',
    './src/**/*.{js,ts,jsx,tsx,vue,svelte}',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg:   '#EEF3FA',
        card: '#FFFFFF',

        // Navigation
        nav: {
          DEFAULT: '#080F1C',
          2:       '#0D1729',
          3:       '#142034',
        },

        // Primary blue
        blue: {
          DEFAULT: '#1769C8',
          hover:   '#1359AA',
          10:      '#E6F0FB',
          20:      '#C8DEFA',
        },

        // Text scale
        t1: '#0B1D33',
        t2: '#33516E',
        t3: '#7094B2',
        t4: '#A8BFD4',

        // Borders
        border: {
          DEFAULT: '#D4E3F0',
          soft:    '#E8F1FA',
        },

        // Semantic
        success: '#0FAD6F',
        warning: '#E07B20',
        purple:  '#6B3FBD',
        danger:  '#CC3A3A',

        // Category accents
        cat: {
          social:   '#1769C8',
          events:   '#6B3FBD',
          edu:      '#0FAD6F',
          outreach: '#E07B20',
          brand:    '#CC3A7A',
          custom:   '#5A6880',
        },
      },

      fontFamily: {
        base: ['Poppins', 'sans-serif'],
      },

      fontWeight: {
        light:    '300',
        regular:  '400',
        medium:   '500',
        semibold: '600',
        bold:     '700',
      },

      borderRadius: {
        sm:  '10px',
        lg:  '16px',
        xl:  '20px',
      },

      boxShadow: {
        card:  '0 1px 4px rgba(11,29,51,.07), 0 2px 10px rgba(11,29,51,.05)',
        hover: '0 6px 24px rgba(11,29,51,.13), 0 2px 8px rgba(11,29,51,.08)',
        btn:   '0 2px 10px rgba(23,105,200,.28), 0 1px 3px rgba(11,29,51,.1)',
        modal: '0 24px 64px rgba(11,29,51,.22), 0 4px 16px rgba(11,29,51,.1)',
      },

      spacing: {
        sidebar: '222px',
        header:  '54px',
      },
    },
  },
  plugins: [],
};
