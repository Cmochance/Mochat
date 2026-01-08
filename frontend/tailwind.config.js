/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 水墨色系
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
        }
      },
      fontFamily: {
        // 书法风格标题字体
        title: ['"Ma Shan Zheng"', '"ZCOOL XiaoWei"', 'serif'],
        // 正文字体
        body: ['"Noto Serif SC"', '"Source Han Serif CN"', 'serif'],
        // 等宽字体
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        // 宣纸纹理渐变
        'paper-gradient': 'linear-gradient(180deg, #f7f5f0 0%, #ebe7df 100%)',
        // 墨晕效果
        'ink-wash': 'radial-gradient(ellipse at center, rgba(26,26,26,0.1) 0%, transparent 70%)',
      },
      boxShadow: {
        'ink': '0 4px 20px rgba(26, 26, 26, 0.15)',
        'ink-lg': '0 8px 40px rgba(26, 26, 26, 0.2)',
      },
      animation: {
        'ink-spread': 'inkSpread 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'brush-stroke': 'brushStroke 0.8s ease-in-out forwards',
      },
      keyframes: {
        inkSpread: {
          '0%': { transform: 'scale(0)', opacity: '0.8' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        brushStroke: {
          '0%': { strokeDashoffset: '100%' },
          '100%': { strokeDashoffset: '0%' },
        },
      },
    },
  },
  plugins: [],
}
