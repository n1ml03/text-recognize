import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react"

export interface Toast {
  id: string
  title?: string
  description?: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

interface ToastProps extends Toast {
  onClose: (id: string) => void
}

const toastVariants = {
  initial: { opacity: 0, y: 50, scale: 0.3 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.5, transition: { duration: 0.2 } },
}

const ToastComponent = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ id, title, description, type = 'info', duration = 5000, action, onClose }, ref) => {
    React.useEffect(() => {
      if (duration > 0) {
        const timer = setTimeout(() => {
          onClose(id)
        }, duration)

        return () => clearTimeout(timer)
      }
    }, [id, duration, onClose])

    const getIcon = () => {
      switch (type) {
        case 'success':
          return <CheckCircle className="h-5 w-5 text-green-500" />
        case 'error':
          return <AlertCircle className="h-5 w-5 text-red-500" />
        case 'warning':
          return <AlertTriangle className="h-5 w-5 text-yellow-500" />
        default:
          return <Info className="h-5 w-5 text-blue-500" />
      }
    }

    const getTypeStyles = () => {
      switch (type) {
        case 'success':
          return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
        case 'error':
          return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
        case 'warning':
          return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'
        default:
          return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
      }
    }

    return (
      <motion.div
        ref={ref}
        layout
        variants={toastVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
        className={cn(
          "relative flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm",
          getTypeStyles()
        )}
      >
        {/* Progress bar */}
        {duration > 0 && (
          <motion.div
            className="absolute bottom-0 left-0 h-1 bg-current opacity-30 rounded-b-lg"
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: duration / 1000, ease: "linear" }}
          />
        )}

        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {title && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-semibold text-foreground"
            >
              {title}
            </motion.div>
          )}
          {description && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className={cn(
                "text-sm text-muted-foreground",
                title && "mt-1"
              )}
            >
              {description}
            </motion.div>
          )}
          {action && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              onClick={action.onClick}
              className="mt-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {action.label}
            </motion.button>
          )}
        </div>

        {/* Close button */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => onClose(id)}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </motion.button>
      </motion.div>
    )
  }
)
ToastComponent.displayName = "Toast"

// Toast container component
interface ToastContainerProps {
  toasts: Toast[]
  onClose: (id: string) => void
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center'
}

export function ToastContainer({ 
  toasts, 
  onClose, 
  position = 'top-right' 
}: ToastContainerProps) {
  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4'
      case 'top-center':
        return 'top-4 left-1/2 -translate-x-1/2'
      case 'top-right':
        return 'top-4 right-4'
      case 'bottom-left':
        return 'bottom-4 left-4'
      case 'bottom-center':
        return 'bottom-4 left-1/2 -translate-x-1/2'
      case 'bottom-right':
        return 'bottom-4 right-4'
      default:
        return 'top-4 right-4'
    }
  }

  return (
    <div className={cn(
      "fixed z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none",
      getPositionClasses()
    )}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastComponent
              {...toast}
              onClose={onClose}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// Toast hook for easy usage
export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { ...toast, id }])
    return id
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const clearToasts = React.useCallback(() => {
    setToasts([])
  }, [])

  return {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    success: (message: string, options?: Partial<Toast>) => 
      addToast({ ...options, description: message, type: 'success' }),
    error: (message: string, options?: Partial<Toast>) => 
      addToast({ ...options, description: message, type: 'error' }),
    warning: (message: string, options?: Partial<Toast>) => 
      addToast({ ...options, description: message, type: 'warning' }),
    info: (message: string, options?: Partial<Toast>) => 
      addToast({ ...options, description: message, type: 'info' }),
  }
}

export { ToastComponent as Toast }
