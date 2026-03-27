/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: '#0066ff', light: '#3d8bff', lighter: '#e6f0ff', dark: '#0052cc' },
        secondary: '#00c2ff',
        success:   { DEFAULT: '#00c853', light: '#e8f5e9' },
        warning:   { DEFAULT: '#ff9800', light: '#fff3e0' },
        danger:    { DEFAULT: '#f44336', light: '#ffebee' },
        info:      { DEFAULT: '#2196f3', light: '#e3f2fd' },
      },
      fontFamily: {
        inter: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      animation: {
        // Names MUST match the custom class names in index.css (without the dot)
        'grid-move':   'gridMove 30s linear infinite',
        'float':       'floatShape 15s ease-in-out infinite',
        'pulse-dot':   'pulseDot 2s ease-in-out infinite',
        'loader':      'loaderPulse 1.4s ease-in-out infinite',
        'card-in':     'cardIn 0.5s cubic-bezier(.175,.885,.32,1.275) forwards',
        'shake':       'shake 0.4s ease',
        'led':         'ledBlink 1.2s infinite',
        'rotate-icon': 'rotateIcon 8s linear infinite',
        'spin-fast':   'spin 0.7s linear infinite',
      },
      keyframes: {
        gridMove:    {
          '0%':   { transform: 'perspective(500px) rotateX(60deg) translateY(0)' },
          '100%': { transform: 'perspective(500px) rotateX(60deg) translateY(60px)' },
        },
        floatShape: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '25%':     { transform: 'translate(20px,-20px) scale(1.05)' },
          '50%':     { transform: 'translate(-10px,10px) scale(.98)' },
          '75%':     { transform: 'translate(15px,15px) scale(1.02)' },
        },
        pulseDot: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(0,200,83,.5)' },
          '50%':     { boxShadow: '0 0 0 8px rgba(0,200,83,0)' },
        },
        loaderPulse: {
          '0%,80%,100%': { transform: 'scale(.5)', opacity: '0.3' },
          '40%':         { transform: 'scale(1)',  opacity: '1'   },
        },
        cardIn: {
          from: { opacity: '0', transform: 'translateY(30px)' },
          to:   { opacity: '1', transform: 'translateY(0)'    },
        },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-8px)' },
          '40%':     { transform: 'translateX(8px)' },
          '60%':     { transform: 'translateX(-6px)' },
          '80%':     { transform: 'translateX(6px)' },
        },
        ledBlink: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0.4' },
        },
        rotateIcon: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      boxShadow: {
        blue:      '0 10px 40px -10px rgba(0,102,255,.3)',
        'blue-lg': '0 20px 50px -10px rgba(0,102,255,.4)',
      },
    },
  },
  plugins: [],
}
