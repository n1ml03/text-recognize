import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  interactive?: boolean
  variant?: 'default' | 'elevated' | 'outlined' | 'ghost'
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = true, interactive = false, variant = 'default', ...props }, ref) => {
    const getVariantClasses = () => {
      switch (variant) {
        case 'elevated':
          return "shadow-lg border-0 bg-card/95 backdrop-blur-sm"
        case 'outlined':
          return "border-2 border-border bg-transparent shadow-none"
        case 'ghost':
          return "border-0 bg-muted/30 shadow-none"
        default:
          return "border bg-card shadow-mobile sm:shadow-sm"
      }
    }

    const cardContent = (
      <div
        ref={ref}
        className={cn(
          "rounded-lg text-card-foreground",
          getVariantClasses(),
          hover && "transition-all duration-200",
          hover && variant === 'default' && "hover:shadow-mobile-lg sm:hover:shadow-md",
          hover && variant === 'elevated' && "hover:shadow-xl hover:shadow-primary/5",
          hover && variant === 'outlined' && "hover:border-primary/50 hover:bg-accent/5",
          hover && variant === 'ghost' && "hover:bg-muted/50",
          interactive && "cursor-pointer",
          className
        )}
        {...props}
      />
    )

    if (interactive) {
      return (
        <motion.div
          whileHover={{
            y: -2,
            transition: { type: "spring", stiffness: 300, damping: 25 }
          }}
          whileTap={{
            scale: 0.98,
            transition: { type: "spring", stiffness: 400, damping: 25 }
          }}
          className="inline-block w-full"
        >
          {cardContent}
        </motion.div>
      )
    }

    return cardContent
  }
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Mobile-first responsive padding
      "flex flex-col space-y-1.5 p-4 sm:p-6",
      className
    )}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      // Mobile-first responsive typography
      "text-lg sm:text-xl lg:text-2xl font-semibold leading-tight tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-sm sm:text-sm text-muted-foreground leading-relaxed",
      className
    )}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Mobile-first responsive padding
      "p-4 pt-0 sm:p-6 sm:pt-0",
      className
    )}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Mobile-first responsive padding and layout
      "flex items-center p-4 pt-0 sm:p-6 sm:pt-0 gap-2 sm:gap-3",
      className
    )}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
