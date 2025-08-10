import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
  success?: boolean
  label?: string
  helperText?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, success, label, helperText, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasContent, setHasContent] = React.useState(false)

    React.useEffect(() => {
      setHasContent(!!props.value || !!props.defaultValue)
    }, [props.value, props.defaultValue])

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(true)
      props.onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false)
      props.onBlur?.(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setHasContent(!!e.target.value)
      props.onChange?.(e)
    }

    return (
      <div className="relative w-full">
        {/* Floating Label */}
        <AnimatePresence>
          {label && (
            <motion.label
              className={cn(
                "absolute left-3 pointer-events-none transition-all duration-200 z-10",
                "text-muted-foreground",
                isFocused || hasContent
                  ? "top-2 text-xs font-medium"
                  : "top-4 text-base",
                isFocused && "text-primary",
                error && "text-destructive"
              )}
              initial={false}
              animate={{
                y: isFocused || hasContent ? -8 : 0,
                scale: isFocused || hasContent ? 0.85 : 1,
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {label}
            </motion.label>
          )}
        </AnimatePresence>

        {/* Textarea with enhanced interactions */}
        <motion.div
          className="relative"
          whileFocus={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <textarea
            className={cn(
              // Mobile-first responsive design
              "flex min-h-[120px] sm:min-h-[80px] w-full rounded-md border bg-background relative",
              // Mobile-optimized padding and text size
              label ? "px-4 pt-6 pb-3 sm:pt-5 sm:pb-2" : "px-4 py-3 sm:px-3 sm:py-2",
              "text-base sm:text-sm leading-relaxed",
              // Enhanced focus and interaction states
              "ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Mobile-specific improvements
              "resize-none touch-manipulation", // Prevent zoom on iOS
              "transition-all duration-200",
              // Dynamic border colors
              error
                ? "border-destructive focus:border-destructive"
                : success
                ? "border-green-500 focus:border-green-600"
                : "border-input hover:border-primary/50 focus:border-primary",
              // Background effects
              "hover:bg-accent/5 focus:bg-background",
              className
            )}
            ref={ref}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            {...props}
          />

          {/* Focus ring animation */}
          <motion.div
            className="absolute inset-0 rounded-md pointer-events-none"
            initial={false}
            animate={{
              boxShadow: isFocused
                ? error
                  ? "0 0 0 3px rgba(239, 68, 68, 0.1)"
                  : success
                  ? "0 0 0 3px rgba(34, 197, 94, 0.1)"
                  : "0 0 0 3px rgba(59, 130, 246, 0.1)"
                : "0 0 0 0px transparent",
            }}
            transition={{ duration: 0.2 }}
          />
        </motion.div>

        {/* Helper text and error messages */}
        <AnimatePresence mode="wait">
          {(error || helperText) && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-2"
            >
              <p
                className={cn(
                  "text-xs leading-relaxed",
                  error ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {error || helperText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
