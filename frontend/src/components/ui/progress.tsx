import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  showValue?: boolean
  animated?: boolean
  variant?: 'default' | 'gradient' | 'striped'
  size?: 'sm' | 'md' | 'lg'
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value, showValue = false, animated = true, variant = 'default', size = 'md', ...props }, ref) => {
  const [displayValue, setDisplayValue] = React.useState(0)

  React.useEffect(() => {
    if (animated && value !== undefined && value !== null) {
      const timer = setTimeout(() => {
        setDisplayValue(value)
      }, 100)
      return () => clearTimeout(timer)
    } else {
      setDisplayValue(value ?? 0)
    }
  }, [value, animated])

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-4',
    lg: 'h-6',
  }

  const getVariantClasses = () => {
    switch (variant) {
      case 'gradient':
        return 'bg-gradient-to-r from-primary via-primary/80 to-primary'
      case 'striped':
        return 'bg-primary bg-stripes'
      default:
        return 'bg-primary'
    }
  }

  return (
    <div className="relative w-full">
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          "relative w-full overflow-hidden rounded-full bg-secondary/50 backdrop-blur-sm",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {/* Background shimmer effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          animate={{
            x: ['-100%', '100%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        <ProgressPrimitive.Indicator
          className={cn(
            "h-full w-full flex-1 relative overflow-hidden rounded-full",
            getVariantClasses(),
            animated && "transition-all duration-500 ease-out"
          )}
          style={{ transform: `translateX(-${100 - (displayValue || 0)}%)` }}
        >
          {/* Animated shine effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          />

          {/* Striped animation for striped variant */}
          {variant === 'striped' && (
            <motion.div
              className="absolute inset-0 bg-stripes-animated"
              animate={{
                backgroundPosition: ['0 0', '20px 0'],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          )}
        </ProgressPrimitive.Indicator>

        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: displayValue > 0
              ? [
                  '0 0 0 0 rgba(59, 130, 246, 0)',
                  '0 0 10px 2px rgba(59, 130, 246, 0.3)',
                  '0 0 0 0 rgba(59, 130, 246, 0)',
                ]
              : '0 0 0 0 rgba(59, 130, 246, 0)',
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </ProgressPrimitive.Root>

      {/* Value display */}
      <AnimatePresence>
        {showValue && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -top-6 right-0 text-xs font-medium text-muted-foreground"
          >
            {Math.round(displayValue)}%
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
