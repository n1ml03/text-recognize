import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          // Mobile-first responsive design
          "flex min-h-[120px] sm:min-h-[80px] w-full rounded-md border border-input bg-background",
          // Mobile-optimized padding and text size
          "px-4 py-3 sm:px-3 sm:py-2 text-base sm:text-sm leading-relaxed",
          // Enhanced focus and interaction states
          "ring-offset-background placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Mobile-specific improvements
          "resize-none touch-manipulation", // Prevent zoom on iOS
          "transition-all duration-200 hover:border-primary/50 focus:border-primary",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
