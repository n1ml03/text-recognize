import { useState, useEffect, useRef } from 'react'

/**
 * Hook to detect user's motion preferences
 * Returns true if user prefers reduced motion
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    // Check if the browser supports the media query
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    
    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches)

    // Listen for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    // Add listener
    mediaQuery.addEventListener('change', handleChange)

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return prefersReducedMotion
}

/**
 * Hook to get animation configuration based on user preferences
 */
export function useAnimationConfig() {
  const prefersReducedMotion = useReducedMotion()

  return {
    prefersReducedMotion,
    // Reduced duration for reduced motion users
    duration: prefersReducedMotion ? 0.01 : undefined,
    // Disable complex animations
    shouldAnimate: !prefersReducedMotion,
    // Simplified transitions for reduced motion
    transition: prefersReducedMotion 
      ? { duration: 0.01 }
      : { type: "spring", stiffness: 300, damping: 25 },
    // Safe animations that work well with reduced motion
    safeTransition: { 
      duration: prefersReducedMotion ? 0.01 : 0.2,
      ease: "easeOut"
    }
  }
}

/**
 * Hook for performance-aware animations
 * Automatically adjusts animation complexity based on device capabilities
 */
export function usePerformanceAwareAnimations() {
  const [isLowPerformance, setIsLowPerformance] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    // Check for performance indicators
    const checkPerformance = () => {
      // Check for low-end device indicators
      const isLowEnd = 
        // Low memory
        (navigator as any).deviceMemory && (navigator as any).deviceMemory < 4 ||
        // Slow connection
        (navigator as any).connection && 
        ((navigator as any).connection.effectiveType === 'slow-2g' || 
         (navigator as any).connection.effectiveType === '2g') ||
        // High CPU usage (simplified check)
        performance.now() > 100

      setIsLowPerformance(isLowEnd)
    }

    checkPerformance()
  }, [])

  return {
    // Disable complex animations on low-performance devices
    shouldUseComplexAnimations: !isLowPerformance && !prefersReducedMotion,
    // Reduce animation duration on low-performance devices
    animationDuration: isLowPerformance || prefersReducedMotion ? 0.01 : undefined,
    // Use simpler easing on low-performance devices
    easing: isLowPerformance ? "linear" : "easeOut",
    // Disable particle effects and complex transforms
    shouldUseParticleEffects: !isLowPerformance && !prefersReducedMotion,
    // Performance flags
    isLowPerformance,
    prefersReducedMotion
  }
}

/**
 * Hook to create accessible animation variants
 */
export function useAccessibleAnimation(
  normalVariants: any,
  reducedVariants?: any
) {
  const { prefersReducedMotion } = useAnimationConfig()

  return prefersReducedMotion && reducedVariants 
    ? reducedVariants 
    : prefersReducedMotion 
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.01 }
        }
      : normalVariants
}

/**
 * Hook for managing focus-visible states with animations
 */
export function useFocusVisible() {
  const [isFocusVisible, setIsFocusVisible] = useState(false)
  const { safeTransition } = useAnimationConfig()

  const focusProps = {
    onFocus: () => setIsFocusVisible(true),
    onBlur: () => setIsFocusVisible(false),
    onMouseDown: () => setIsFocusVisible(false),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setIsFocusVisible(true)
      }
    }
  }

  const focusStyles = {
    outline: isFocusVisible ? '2px solid hsl(var(--ring))' : 'none',
    outlineOffset: '2px',
    transition: safeTransition
  }

  return {
    isFocusVisible,
    focusProps,
    focusStyles
  }
}

/**
 * Utility function to create motion-safe variants
 */
export function createMotionSafeVariants(variants: any) {
  return {
    ...variants,
    // Add reduced motion alternatives
    reducedMotion: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.01 }
    }
  }
}

/**
 * Hook for intersection-based animations (performance optimization)
 */
export function useIntersectionAnimation(threshold = 0.1) {
  const [isInView, setIsInView] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || hasAnimated) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          setHasAnimated(true)
          observer.disconnect()
        }
      },
      { threshold }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [threshold, hasAnimated])

  return {
    ref,
    isInView,
    shouldAnimate: isInView
  }
}
