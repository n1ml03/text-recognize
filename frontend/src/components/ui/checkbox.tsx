import * as React from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        className={cn(
          // Mobile-first touch-friendly sizing
          "h-5 w-5 sm:h-4 sm:w-4 rounded border-2 border-input bg-background text-primary",
          "focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "accent-primary cursor-pointer", // For better browser default styling
          "transition-all duration-200 hover:border-primary/50",
          className
        )}
        onChange={onCheckedChange ? (e) => onCheckedChange(e.target.checked) : undefined}
        ref={ref}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
