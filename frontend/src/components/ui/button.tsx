import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 transition-transform",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/90",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline active:text-primary/80",
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
