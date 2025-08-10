import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface TooltipProps {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  delay?: number
  className?: string
  contentClassName?: string
  disabled?: boolean
  arrow?: boolean
}

export function Tooltip({
  children,
  content,
  side = 'top',
  align = 'center',
  delay = 500,
  className,
  contentClassName,
  disabled = false,
  arrow = true,
}: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false)
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const tooltipRef = React.useRef<HTMLDivElement>(null)
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const showTooltip = React.useCallback(() => {
    if (disabled) return
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, delay)
  }, [disabled, delay])

  const hideTooltip = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsVisible(false)
  }, [])

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    }

    let x = 0
    let y = 0

    // Calculate base position
    switch (side) {
      case 'top':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        y = triggerRect.top - tooltipRect.height - 8
        break
      case 'bottom':
        x = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        y = triggerRect.bottom + 8
        break
      case 'left':
        x = triggerRect.left - tooltipRect.width - 8
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        break
      case 'right':
        x = triggerRect.right + 8
        y = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        break
    }

    // Adjust for alignment
    if (side === 'top' || side === 'bottom') {
      switch (align) {
        case 'start':
          x = triggerRect.left
          break
        case 'end':
          x = triggerRect.right - tooltipRect.width
          break
      }
    } else {
      switch (align) {
        case 'start':
          y = triggerRect.top
          break
        case 'end':
          y = triggerRect.bottom - tooltipRect.height
          break
      }
    }

    // Keep tooltip within viewport
    x = Math.max(8, Math.min(x, viewport.width - tooltipRect.width - 8))
    y = Math.max(8, Math.min(y, viewport.height - tooltipRect.height - 8))

    setPosition({ x, y })
  }, [side, align])

  React.useEffect(() => {
    if (isVisible) {
      updatePosition()
      window.addEventListener('scroll', updatePosition)
      window.addEventListener('resize', updatePosition)
      
      return () => {
        window.removeEventListener('scroll', updatePosition)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [isVisible, updatePosition])

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const getArrowPosition = () => {
    if (!triggerRef.current || !arrow) return {}

    switch (side) {
      case 'top':
        return {
          bottom: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '4px solid hsl(var(--popover))',
        }
      case 'bottom':
        return {
          top: '-4px',
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderBottom: '4px solid hsl(var(--popover))',
        }
      case 'left':
        return {
          right: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderLeft: '4px solid hsl(var(--popover))',
        }
      case 'right':
        return {
          left: '-4px',
          top: '50%',
          transform: 'translateY(-50%)',
          borderTop: '4px solid transparent',
          borderBottom: '4px solid transparent',
          borderRight: '4px solid hsl(var(--popover))',
        }
      default:
        return {}
    }
  }

  const getAnimationVariants = () => {
    const baseVariants = {
      initial: { opacity: 0, scale: 0.8 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.8 },
    }

    switch (side) {
      case 'top':
        return {
          ...baseVariants,
          initial: { ...baseVariants.initial, y: 10 },
          animate: { ...baseVariants.animate, y: 0 },
          exit: { ...baseVariants.exit, y: 10 },
        }
      case 'bottom':
        return {
          ...baseVariants,
          initial: { ...baseVariants.initial, y: -10 },
          animate: { ...baseVariants.animate, y: 0 },
          exit: { ...baseVariants.exit, y: -10 },
        }
      case 'left':
        return {
          ...baseVariants,
          initial: { ...baseVariants.initial, x: 10 },
          animate: { ...baseVariants.animate, x: 0 },
          exit: { ...baseVariants.exit, x: 10 },
        }
      case 'right':
        return {
          ...baseVariants,
          initial: { ...baseVariants.initial, x: -10 },
          animate: { ...baseVariants.animate, x: 0 },
          exit: { ...baseVariants.exit, x: -10 },
        }
      default:
        return baseVariants
    }
  }

  return (
    <>
      <div
        ref={triggerRef}
        className={cn("inline-block", className)}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {children}
      </div>

      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={tooltipRef}
            className={cn(
              "fixed z-50 px-3 py-2 text-sm font-medium text-popover-foreground",
              "bg-popover border border-border rounded-md shadow-lg backdrop-blur-sm",
              "max-w-xs break-words",
              contentClassName
            )}
            style={{
              left: position.x,
              top: position.y,
            }}
            variants={getAnimationVariants()}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 25,
              duration: 0.2,
            }}
          >
            {content}
            
            {arrow && (
              <div
                className="absolute w-0 h-0"
                style={getArrowPosition()}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
