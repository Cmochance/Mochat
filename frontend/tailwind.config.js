/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy palette
        ink: {
          black: '#1a1a1a',
          dark: '#2d2d2d',
          medium: '#4a4a4a',
          light: '#6b6b6b',
          faint: '#8a8a8a',
        },
        paper: {
          white: '#f7f5f0',
          cream: '#ebe7df',
          aged: '#d9d3c7',
          dark: '#c9c3b7',
        },
        vermilion: {
          DEFAULT: '#c73e3a',
          light: '#e85a56',
          dark: '#9a2f2c',
        },
        cyan: {
          ink: '#3d5a5b',
        },
        // Semantic palette for refreshed UI
        canvas: {
          DEFAULT: '#f4efe6',
          soft: '#f8f4ed',
          elevated: '#fffdf9',
        },
        text: {
          primary: '#1f1f1f',
          secondary: '#505050',
          muted: '#7a7a7a',
        },
        line: {
          soft: '#ddd5c8',
          strong: '#bfb3a1',
        },
        accent: {
          seal: '#b73b34',
          info: '#365c5b',
          danger: '#b73b34',
        },
        jade: '#2f8a63',
      },
      fontFamily: {
        title: ['"Ma Shan Zheng"', '"ZCOOL XiaoWei"', 'serif'],
        body: ['"Noto Serif SC"', '"Source Han Serif CN"', 'serif'],
        ui: ['"Noto Sans SC"', '"PingFang SC"', '"Helvetica Neue"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'paper-gradient': 'linear-gradient(180deg, #f7f5f0 0%, #ebe7df 100%)',
        'canvas-gradient': 'radial-gradient(circle at top right, #fcf8f0 0%, #f4efe6 42%, #ece2d1 100%)',
        'ink-wash': 'radial-gradient(ellipse at center, rgba(26,26,26,0.1) 0%, transparent 70%)',
      },
      boxShadow: {
        'ink': '0 4px 20px rgba(26, 26, 26, 0.15)',
        'ink-lg': '0 8px 40px rgba(26, 26, 26, 0.2)',
        'panel': '0 12px 30px rgba(23, 23, 23, 0.08)',
      },
      animation: {
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'soft-pulse': 'softPulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        softPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
