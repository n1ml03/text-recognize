/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Mobile-first breakpoints
    screens: {
      'xs': '475px',    // Extra small devices
      'sm': '640px',    // Small devices (landscape phones)
      'md': '768px',    // Medium devices (tablets)
      'lg': '1024px',   // Large devices (laptops)
      'xl': '1280px',   // Extra large devices (desktops)
      '2xl': '1536px',  // 2X large devices (large desktops)
    },
    extend: {
      colors: {
        background: 'hsl(var(--color-background))',
        foreground: 'hsl(var(--color-foreground))',
        card: 'hsl(var(--color-card))',
        'card-foreground': 'hsl(var(--color-card-foreground))',
        popover: 'hsl(var(--color-popover))',
        'popover-foreground': 'hsl(var(--color-popover-foreground))',
        primary: 'hsl(var(--color-primary))',
        'primary-foreground': 'hsl(var(--color-primary-foreground))',
        secondary: 'hsl(var(--color-secondary))',
        'secondary-foreground': 'hsl(var(--color-secondary-foreground))',
        muted: 'hsl(var(--color-muted))',
        'muted-foreground': 'hsl(var(--color-muted-foreground))',
        accent: 'hsl(var(--color-accent))',
        'accent-foreground': 'hsl(var(--color-accent-foreground))',
        destructive: 'hsl(var(--color-destructive))',
        'destructive-foreground': 'hsl(var(--color-destructive-foreground))',
        border: 'hsl(var(--color-border))',
        input: 'hsl(var(--color-input))',
        ring: 'hsl(var(--color-ring))',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'calc(var(--radius) + 2px)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Touch-friendly sizing
      spacing: {
        'touch': '44px',      // Minimum touch target size
        'touch-sm': '40px',   // Small touch target
        'touch-lg': '48px',   // Large touch target
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      // Mobile-optimized font sizes
      fontSize: {
        'xs-mobile': ['0.75rem', { lineHeight: '1.2' }],
        'sm-mobile': ['0.875rem', { lineHeight: '1.3' }],
        'base-mobile': ['1rem', { lineHeight: '1.4' }],
        'lg-mobile': ['1.125rem', { lineHeight: '1.4' }],
        'xl-mobile': ['1.25rem', { lineHeight: '1.3' }],
      },
      // Mobile-friendly animations
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'slide-right': 'slideRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      // Mobile-optimized shadows
      boxShadow: {
        'mobile': '0 2px 8px rgba(0, 0, 0, 0.1)',
        'mobile-lg': '0 4px 16px rgba(0, 0, 0, 0.15)',
        'touch': '0 2px 4px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
}
