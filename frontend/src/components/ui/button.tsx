import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 overflow-hidden group",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:bg-primary/95 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/25 active:bg-destructive/95 active:scale-[0.98]",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 hover:shadow-md active:bg-accent/80 active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-md active:bg-secondary/90 active:scale-[0.98]",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/80 active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80 hover:scale-105",
      },
      size: {
        // Mobile-first touch-friendly sizes (minimum 44px height)
        xs: "h-8 px-2 text-xs sm:h-9 sm:px-3",                    // Small screens only
        sm: "h-touch-sm px-3 text-sm sm:h-9 sm:px-3",            // 40px mobile, 36px desktop
        default: "h-touch px-4 py-2 sm:h-10 sm:px-4",            // 44px mobile, 40px desktop
        lg: "h-touch-lg px-6 text-base sm:h-11 sm:px-8",         // 48px mobile, 44px desktop
        xl: "h-12 px-8 text-lg sm:h-14 sm:px-10",                // Extra large for primary actions
        icon: "h-touch w-touch p-0 sm:h-10 sm:w-10",             // Square touch targets
        "icon-sm": "h-touch-sm w-touch-sm p-0 sm:h-8 sm:w-8",   // Small icon buttons
        "icon-lg": "h-touch-lg w-touch-lg p-0 sm:h-12 sm:w-12", // Large icon buttons
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  ripple?: boolean
}

// Ripple effect component
const RippleEffect = ({ x, y }: { x: number; y: number }) => (
  <motion.span
    className="absolute rounded-full bg-current opacity-30 pointer-events-none"
    initial={{ scale: 0, opacity: 0.6 }}
    animate={{ scale: 4, opacity: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.6, ease: "easeOut" }}
    style={{
      left: x - 10,
      top: y - 10,
      width: 20,
      height: 20,
    }}
  />
)

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, ripple = true, children, onClick, ...props }, ref) => {
    const [ripples, setRipples] = React.useState<Array<{ id: number; x: number; y: number }>>([])
    const rippleId = React.useRef(0)

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      if (ripple && !props.disabled && !loading) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        const newRipple = { id: rippleId.current++, x, y }
        setRipples(prev => [...prev, newRipple])

        // Remove ripple after animation
        setTimeout(() => {
          setRipples(prev => prev.filter(r => r.id !== newRipple.id))
        }, 600)
      }

      onClick?.(e)
    }, [ripple, props.disabled, loading, onClick])

    return (
      <motion.div
        whileTap={!props.disabled && !loading ? { scale: 0.98 } : undefined}
        whileHover={!props.disabled && !loading ? { y: -1 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="inline-block"
      >
        <button
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          onClick={handleClick}
          {...props}
        >
          {/* Background gradient overlay for enhanced hover effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-white/10 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            initial={false}
          />

          {/* Ripple effects */}
          <AnimatePresence>
            {ripples.map(ripple => (
              <RippleEffect key={ripple.id} x={ripple.x} y={ripple.y} />
            ))}
          </AnimatePresence>

          {/* Content with loading state */}
          <motion.div
            className="relative z-10 flex items-center justify-center gap-2"
            animate={{ opacity: loading ? 0.7 : 1 }}
            transition={{ duration: 0.2 }}
          >
            {loading && (
              <motion.div
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            )}
            {children}
          </motion.div>
        </button>
      </motion.div>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
