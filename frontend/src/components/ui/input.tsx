import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, Check, AlertCircle } from "lucide-react"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  success?: boolean
  label?: string
  helperText?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  showPasswordToggle?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    type, 
    error, 
    success, 
    label, 
    helperText, 
    leftIcon, 
    rightIcon, 
    showPasswordToggle = false,
    ...props 
  }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [hasContent, setHasContent] = React.useState(false)
    const [showPassword, setShowPassword] = React.useState(false)
    const [inputType, setInputType] = React.useState(type)

    React.useEffect(() => {
      setHasContent(!!props.value || !!props.defaultValue)
    }, [props.value, props.defaultValue])

    React.useEffect(() => {
      if (showPasswordToggle && type === 'password') {
        setInputType(showPassword ? 'text' : 'password')
      } else {
        setInputType(type)
      }
    }, [showPassword, type, showPasswordToggle])

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true)
      props.onFocus?.(e)
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false)
      props.onBlur?.(e)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasContent(!!e.target.value)
      props.onChange?.(e)
    }

    const togglePasswordVisibility = () => {
      setShowPassword(!showPassword)
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
                leftIcon && "left-10",
                isFocused || hasContent
                  ? "top-2 text-xs font-medium"
                  : "top-1/2 -translate-y-1/2 text-base",
                isFocused && "text-primary",
                error && "text-destructive"
              )}
              initial={false}
              animate={{
                y: isFocused || hasContent ? -16 : 0,
                scale: isFocused || hasContent ? 0.85 : 1,
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {label}
            </motion.label>
          )}
        </AnimatePresence>

        {/* Input container with enhanced interactions */}
        <motion.div
          className="relative"
          whileFocus={{ scale: 1.01 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Left Icon */}
          {leftIcon && (
            <motion.div
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
              animate={{ color: isFocused ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
              transition={{ duration: 0.2 }}
            >
              {leftIcon}
            </motion.div>
          )}

          <input
            type={inputType}
            className={cn(
              // Base styles
              "flex h-10 w-full rounded-md border bg-background relative",
              // Padding adjustments for icons and labels
              leftIcon ? "pl-10" : "pl-3",
              (rightIcon || showPasswordToggle || success || error) ? "pr-10" : "pr-3",
              label ? "pt-6 pb-2" : "py-2",
              // Text and interaction styles
              "text-base sm:text-sm",
              "ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // Mobile optimizations
              "touch-manipulation transition-all duration-200",
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

          {/* Right Icon Area */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Success/Error Icons */}
            <AnimatePresence mode="wait">
              {success && !error && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <Check className="h-4 w-4 text-green-500" />
                </motion.div>
              )}
              {error && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                >
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Password Toggle */}
            {showPasswordToggle && type === 'password' && (
              <motion.button
                type="button"
                onClick={togglePasswordVisibility}
                className="text-muted-foreground hover:text-foreground transition-colors"
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.05 }}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </motion.button>
            )}

            {/* Custom Right Icon */}
            {rightIcon && !success && !error && (
              <motion.div
                className="text-muted-foreground"
                animate={{ color: isFocused ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
                transition={{ duration: 0.2 }}
              >
                {rightIcon}
              </motion.div>
            )}
          </div>

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
Input.displayName = "Input"

export { Input }
