import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { 
  Upload, 
  Heart, 
  Star, 
  Play, 
  Pause,
  Sun,
  Moon,
  Loader2,
  AlertCircle,
  CheckCircle,
  AlertTriangle
} from "lucide-react"

interface AnimatedIconProps {
  icon: React.ComponentType<any>
  className?: string
  size?: number
  animate?: 'bounce' | 'pulse' | 'spin' | 'shake' | 'float' | 'heartbeat' | 'none'
  trigger?: 'hover' | 'click' | 'always' | 'none'
  color?: string
}

const animationVariants = {
  bounce: {
    animate: {
      y: [0, -10, 0],
      transition: {
        duration: 0.6,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  },
  pulse: {
    animate: {
      scale: [1, 1.2, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  },
  spin: {
    animate: {
      rotate: 360,
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "linear"
      }
    }
  },
  shake: {
    animate: {
      x: [0, -5, 5, -5, 5, 0],
      transition: {
        duration: 0.5,
        repeat: Infinity,
        repeatDelay: 2
      }
    }
  },
  float: {
    animate: {
      y: [0, -8, 0],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut"
      }
    }
  },
  heartbeat: {
    animate: {
      scale: [1, 1.3, 1, 1.3, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        repeatDelay: 1,
        times: [0, 0.1, 0.3, 0.4, 1]
      }
    }
  }
}

export function AnimatedIcon({
  icon: Icon,
  className,
  size = 24,
  animate = 'none',
  trigger = 'none',
  color,
  ...props
}: AnimatedIconProps) {
  const [isTriggered, setIsTriggered] = React.useState(false)

  const shouldAnimate = trigger === 'always' || (trigger !== 'none' && isTriggered)
  const animation = animate !== 'none' && shouldAnimate ? animationVariants[animate] : {}

  const handleMouseEnter = () => {
    if (trigger === 'hover') setIsTriggered(true)
  }

  const handleMouseLeave = () => {
    if (trigger === 'hover') setIsTriggered(false)
  }

  const handleClick = () => {
    if (trigger === 'click') {
      setIsTriggered(true)
      setTimeout(() => setIsTriggered(false), 1000)
    }
  }

  return (
    <motion.div
      className={cn("inline-flex items-center justify-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      {...animation}
    >
      <Icon 
        size={size} 
        className={color ? `text-${color}` : undefined}
        {...props}
      />
    </motion.div>
  )
}

// Predefined animated icons for common use cases
export function LoadingIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <AnimatedIcon
      icon={Loader2}
      className={className}
      size={size}
      animate="spin"
      trigger="always"
    />
  )
}

export function SuccessIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={className}
    >
      <CheckCircle size={size} className="text-green-500" />
    </motion.div>
  )
}

export function ErrorIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={className}
    >
      <AlertCircle size={size} className="text-red-500" />
    </motion.div>
  )
}

export function WarningIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <AnimatedIcon
      icon={AlertTriangle}
      className={className}
      size={size}
      animate="shake"
      trigger="always"
      color="yellow-500"
    />
  )
}

export function HeartIcon({
  className,
  size = 24,
  filled = false,
  onClick
}: {
  className?: string;
  size?: number;
  filled?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.2 }}
      whileTap={{ scale: 0.9 }}
      className={className}
      onClick={onClick}
    >
      <Heart
        size={size}
        className={cn(
          "transition-colors cursor-pointer",
          filled ? "fill-red-500 text-red-500" : "text-gray-400 hover:text-red-500"
        )}
      />
    </motion.div>
  )
}

export function StarIcon({
  className,
  size = 24,
  filled = false,
  onClick
}: {
  className?: string;
  size?: number;
  filled?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.1, rotate: 5 }}
      whileTap={{ scale: 0.9 }}
      className={className}
      onClick={onClick}
    >
      <Star
        size={size}
        className={cn(
          "transition-colors cursor-pointer",
          filled ? "fill-yellow-400 text-yellow-400" : "text-gray-400 hover:text-yellow-400"
        )}
      />
    </motion.div>
  )
}

export function UploadIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <AnimatedIcon
      icon={Upload}
      className={className}
      size={size}
      animate="bounce"
      trigger="hover"
    />
  )
}

export function PlayPauseIcon({ 
  isPlaying, 
  className, 
  size = 24 
}: { 
  isPlaying: boolean; 
  className?: string; 
  size?: number 
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className={className}
    >
      <AnimatePresence mode="wait">
        {isPlaying ? (
          <motion.div
            key="pause"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Pause size={size} />
          </motion.div>
        ) : (
          <motion.div
            key="play"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Play size={size} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function ThemeToggleIcon({
  isDark,
  className,
  size = 24,
  onClick
}: {
  isDark: boolean;
  className?: string;
  size?: number;
  onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      className={className}
      onClick={onClick}
    >
      <AnimatePresence mode="wait">
        {isDark ? (
          <motion.div
            key="sun"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 180 }}
            transition={{ duration: 0.3 }}
          >
            <Sun size={size} />
          </motion.div>
        ) : (
          <motion.div
            key="moon"
            initial={{ scale: 0, rotate: 180 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: -180 }}
            transition={{ duration: 0.3 }}
          >
            <Moon size={size} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
