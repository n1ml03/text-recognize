import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Check, Minus } from "lucide-react"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, label, indeterminate = false, checked, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(checked || false)
    const [isFocused, setIsFocused] = React.useState(false)

    React.useEffect(() => {
      setIsChecked(checked || false)
    }, [checked])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked
      setIsChecked(newChecked)
      onCheckedChange?.(newChecked)
    }

    const handleFocus = () => setIsFocused(true)
    const handleBlur = () => setIsFocused(false)

    const checkboxContent = (
      <motion.div
        className="relative inline-flex items-center"
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {/* Hidden native checkbox for accessibility */}
        <input
          type="checkbox"
          className="sr-only"
          checked={isChecked}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          ref={ref}
          {...props}
        />

        {/* Custom checkbox visual */}
        <motion.div
          className={cn(
            // Base styling
            "relative flex items-center justify-center",
            "h-5 w-5 sm:h-4 sm:w-4 rounded border-2 cursor-pointer",
            "transition-all duration-200",
            // Dynamic colors
            isChecked || indeterminate
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-background border-input hover:border-primary/50",
            // Focus states
            isFocused && "ring-2 ring-ring ring-offset-2",
            // Disabled states
            props.disabled && "cursor-not-allowed opacity-50",
            className
          )}
          animate={{
            scale: isChecked || indeterminate ? 1.1 : 1,
            backgroundColor: isChecked || indeterminate
              ? "hsl(var(--primary))"
              : "hsl(var(--background))",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          {/* Check/Indeterminate Icon */}
          <AnimatePresence mode="wait">
            {indeterminate ? (
              <motion.div
                key="indeterminate"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Minus className="h-3 w-3 text-primary-foreground" />
              </motion.div>
            ) : isChecked ? (
              <motion.div
                key="checked"
                initial={{ scale: 0, opacity: 0, rotate: -180 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0, rotate: 180 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <Check className="h-3 w-3 text-primary-foreground" />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Ripple effect */}
          <motion.div
            className="absolute inset-0 rounded border-2 border-primary/20"
            initial={{ scale: 1, opacity: 0 }}
            animate={
              isChecked || indeterminate
                ? { scale: 1.5, opacity: [0, 0.3, 0] }
                : { scale: 1, opacity: 0 }
            }
            transition={{ duration: 0.4 }}
          />
        </motion.div>

        {/* Label */}
        {label && (
          <motion.label
            className={cn(
              "ml-2 text-sm font-medium cursor-pointer select-none",
              "text-foreground transition-colors",
              props.disabled && "cursor-not-allowed opacity-50"
            )}
            animate={{
              color: isFocused ? "hsl(var(--primary))" : "hsl(var(--foreground))"
            }}
            transition={{ duration: 0.2 }}
          >
            {label}
          </motion.label>
        )}
      </motion.div>
    )

    return checkboxContent
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
