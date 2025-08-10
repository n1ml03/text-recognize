import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  className?: string;
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars';
  color?: 'primary' | 'secondary' | 'muted';
}

// Animated dots loader
const DotsLoader = ({ size, color }: { size: string; color: string }) => {
  const dotVariants = {
    initial: { y: 0 },
    animate: { y: -10 },
  };

  const dotSize = size === 'sm' ? 'w-1 h-1' : size === 'md' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className={cn('rounded-full', dotSize, color)}
          variants={dotVariants}
          initial="initial"
          animate="animate"
          transition={{
            duration: 0.6,
            repeat: Infinity,
            repeatType: "reverse",
            delay: index * 0.1,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// Animated bars loader
const BarsLoader = ({ size, color }: { size: string; color: string }) => {
  const barHeight = size === 'sm' ? 'h-3' : size === 'md' ? 'h-4' : size === 'lg' ? 'h-6' : 'h-8';
  const barWidth = size === 'sm' ? 'w-0.5' : size === 'md' ? 'w-1' : size === 'lg' ? 'w-1.5' : 'w-2';

  return (
    <div className="flex items-end gap-1">
      {[0, 1, 2, 3].map((index) => (
        <motion.div
          key={index}
          className={cn('rounded-sm', barWidth, barHeight, color)}
          animate={{
            scaleY: [1, 0.3, 1],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: index * 0.1,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

// Pulse loader
const PulseLoader = ({ size, color }: { size: string; color: string }) => {
  const pulseSize = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-6 h-6' : size === 'lg' ? 'w-8 h-8' : 'w-12 h-12';

  return (
    <motion.div
      className={cn('rounded-full', pulseSize, color)}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [1, 0.7, 1],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    />
  );
};

export function LoadingSpinner({
  size = 'md',
  text = 'Loading...',
  className = '',
  variant = 'spinner',
  color = 'primary'
}: LoadingSpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12',
  };

  const colorClasses = {
    primary: 'text-primary',
    secondary: 'text-secondary-foreground',
    muted: 'text-muted-foreground',
  };

  const bgColorClasses = {
    primary: 'bg-primary',
    secondary: 'bg-secondary-foreground',
    muted: 'bg-muted-foreground',
  };

  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return <DotsLoader size={size} color={bgColorClasses[color]} />;
      case 'bars':
        return <BarsLoader size={size} color={bgColorClasses[color]} />;
      case 'pulse':
        return <PulseLoader size={size} color={bgColorClasses[color]} />;
      default:
        return (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className={cn(sizes[size], colorClasses[color])} />
          </motion.div>
        );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={cn('flex items-center justify-center gap-3', className)}
    >
      {renderLoader()}
      <AnimatePresence>
        {text && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ delay: 0.1 }}
            className="text-sm text-muted-foreground font-medium"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
