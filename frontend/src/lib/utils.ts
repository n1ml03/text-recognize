import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolves CSS custom properties to their computed values for Framer Motion animations
 * This prevents the "not an animatable value" warnings when using CSS variables
 */
export function getCSSVariableValue(variable: string): string {
  if (typeof window === 'undefined') {
    // Return fallback values for SSR
    const fallbacks: Record<string, string> = {
      '--color-primary': '221.2 83.2% 53.3%',
      '--color-foreground': '222.2 84% 4.9%',
      '--color-background': '0 0% 100%',
      '--color-primary-foreground': '210 40% 98%',
      '--color-muted': '210 40% 96%',
      '--color-muted-foreground': '215.4 16.3% 46.9%',
      '--color-secondary': '210 40% 96%',
      '--color-accent': '210 40% 96%',
      '--color-destructive': '0 84.2% 60.2%',
      '--color-border': '214.3 31.8% 91.4%',
      '--color-ring': '221.2 83.2% 53.3%',
    }
    return fallbacks[variable] || '0 0% 0%'
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim()

  return value || '0 0% 0%' // Fallback if variable not found
}

/**
 * Creates animatable HSL color values from CSS custom properties
 */
export function getAnimatableColor(cssVariable: string): string {
  const hslValues = getCSSVariableValue(cssVariable)
  return `hsl(${hslValues})`
}

/**
 * Utility for creating theme-aware color animations
 */
export const themeColors = {
  primary: () => getAnimatableColor('--color-primary'),
  foreground: () => getAnimatableColor('--color-foreground'),
  background: () => getAnimatableColor('--color-background'),
  primaryForeground: () => getAnimatableColor('--color-primary-foreground'),
  secondary: () => getAnimatableColor('--color-secondary'),
  muted: () => getAnimatableColor('--color-muted'),
  mutedForeground: () => getAnimatableColor('--color-muted-foreground'),
  accent: () => getAnimatableColor('--color-accent'),
  destructive: () => getAnimatableColor('--color-destructive'),
  border: () => getAnimatableColor('--color-border'),
  ring: () => getAnimatableColor('--color-ring'),
}
