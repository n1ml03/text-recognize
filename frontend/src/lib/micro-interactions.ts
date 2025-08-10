import type { Variants } from "framer-motion"

// Common animation variants for consistent micro-interactions
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 }
}

export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 }
}

export const fadeInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 }
}

export const fadeInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 }
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 }
}

export const slideInFromBottom: Variants = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" }
}

export const slideInFromTop: Variants = {
  initial: { y: "-100%" },
  animate: { y: 0 },
  exit: { y: "-100%" }
}

export const slideInFromLeft: Variants = {
  initial: { x: "-100%" },
  animate: { x: 0 },
  exit: { x: "-100%" }
}

export const slideInFromRight: Variants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" }
}

// Stagger animations for lists
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 }
}

// Button interactions
export const buttonHover = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 400, damping: 25 }
}

export const buttonTap = {
  scale: 0.98,
  transition: { type: "spring", stiffness: 400, damping: 25 }
}

// Card interactions
export const cardHover = {
  y: -4,
  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
  transition: { type: "spring", stiffness: 300, damping: 25 }
}

export const cardTap = {
  scale: 0.98,
  transition: { type: "spring", stiffness: 400, damping: 25 }
}

// Input focus animations
export const inputFocus = {
  scale: 1.02,
  transition: { type: "spring", stiffness: 300, damping: 25 }
}

// Loading animations
export const pulseAnimation = {
  scale: [1, 1.05, 1],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut"
  }
}

export const bounceAnimation = {
  y: [0, -10, 0],
  transition: {
    duration: 0.6,
    repeat: Infinity,
    ease: "easeInOut"
  }
}

// Success/Error feedback animations
export const successPop: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: { 
    scale: [0, 1.2, 1], 
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25,
      duration: 0.6
    }
  },
  exit: { scale: 0, opacity: 0 }
}

export const errorShake: Variants = {
  initial: { x: 0 },
  animate: { 
    x: [0, -10, 10, -10, 10, 0],
    transition: { duration: 0.5 }
  }
}

// Page transitions
export const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5
}

export const pageVariants: Variants = {
  initial: { opacity: 0, x: "-100vw" },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: "100vw" }
}

// Modal animations
export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
}

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.8, y: 50 },
  animate: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.8, 
    y: 50,
    transition: { duration: 0.2 }
  }
}

// Notification animations
export const notificationSlideIn: Variants = {
  initial: { x: "100%", opacity: 0 },
  animate: { 
    x: 0, 
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 25
    }
  },
  exit: { 
    x: "100%", 
    opacity: 0,
    transition: { duration: 0.2 }
  }
}

// Utility functions for creating custom animations
export const createStaggerAnimation = (staggerDelay: number = 0.1) => ({
  container: {
    animate: {
      transition: {
        staggerChildren: staggerDelay
      }
    }
  },
  item: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 }
  }
})

export const createFadeAnimation = (direction: 'up' | 'down' | 'left' | 'right' = 'up', distance: number = 20) => {
  const getInitialPosition = () => {
    switch (direction) {
      case 'up': return { y: distance }
      case 'down': return { y: -distance }
      case 'left': return { x: distance }
      case 'right': return { x: -distance }
    }
  }

  const getExitPosition = () => {
    switch (direction) {
      case 'up': return { y: -distance }
      case 'down': return { y: distance }
      case 'left': return { x: -distance }
      case 'right': return { x: distance }
    }
  }

  return {
    initial: { opacity: 0, ...getInitialPosition() },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, ...getExitPosition() }
  }
}

export const createScaleAnimation = (initialScale: number = 0.8, animateScale: number = 1) => ({
  initial: { opacity: 0, scale: initialScale },
  animate: { opacity: 1, scale: animateScale },
  exit: { opacity: 0, scale: initialScale }
})

// Spring configurations for different interaction types
export const springConfigs = {
  gentle: { type: "spring", stiffness: 120, damping: 14 },
  wobbly: { type: "spring", stiffness: 180, damping: 12 },
  stiff: { type: "spring", stiffness: 400, damping: 25 },
  slow: { type: "spring", stiffness: 280, damping: 60 },
  molasses: { type: "spring", stiffness: 120, damping: 25 }
} as const

// Easing functions for different animation types
export const easings = {
  easeInOut: [0.4, 0, 0.2, 1],
  easeOut: [0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  sharp: [0.4, 0, 0.6, 1],
  anticipate: [0.175, 0.885, 0.32, 1.275]
} as const
