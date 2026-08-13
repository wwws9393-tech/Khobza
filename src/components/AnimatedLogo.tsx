import React from 'react';
import { motion } from 'motion/react';

interface Props {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const AnimatedLogo: React.FC<Props> = ({
  size = 'md',
  showText = true,
  className = '',
}) => {
  const sizeMap = {
    sm: { container: 'w-8 h-8', svg: 32, font: 'text-base font-black', subtitle: 'text-[9px]' },
    md: { container: 'w-9 h-9', svg: 36, font: 'text-lg font-black', subtitle: 'text-[10px]' },
    lg: { container: 'w-14 h-14', svg: 56, font: 'text-2xl', subtitle: 'text-xs' },
    xl: { container: 'w-20 h-20', svg: 80, font: 'text-3xl', subtitle: 'text-sm' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Animated Emblem Container */}
      <div className={`relative ${currentSize.container} flex items-center justify-center shrink-0`}>
        {/* Outer Pulsing & Rotating Glow Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-300 to-amber-600 opacity-80 blur-[2px]"
        />

        {/* Shimmer Ambient Aura */}
        <motion.div
          animate={{ scale: [0.95, 1.1, 0.95], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -inset-1 rounded-2xl bg-amber-400/40 blur-md"
        />

        {/* Main Badge Canvas */}
        <div className="relative w-full h-full bg-gradient-to-b from-stone-900 via-amber-950 to-stone-900 rounded-2xl p-1.5 shadow-lg border border-amber-500/50 overflow-hidden flex items-center justify-center">
          {/* Animated Steam Waves SVG */}
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
            </defs>

            {/* Floating Steam Particles */}
            <motion.path
              d="M38 32 C38 22, 44 20, 42 12 M50 30 C50 20, 56 18, 54 10 M62 32 C62 22, 68 20, 66 12"
              stroke="#fef08a"
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity="0.8"
              animate={{
                d: [
                  "M38 32 C38 22, 44 20, 42 12 M50 30 C50 20, 56 18, 54 10 M62 32 C62 22, 68 20, 66 12",
                  "M38 28 C38 18, 42 16, 40 8 M50 26 C50 16, 54 14, 52 6 M62 28 C62 18, 66 16, 64 8",
                  "M38 32 C38 22, 44 20, 42 12 M50 30 C50 20, 56 18, 54 10 M62 32 C62 22, 68 20, 66 12",
                ],
                opacity: [0.3, 0.9, 0.3],
              }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Golden Artisan Bread Loaf Icon */}
            <motion.path
              d="M 22 56 C 22 40, 36 34, 50 34 C 64 34, 78 40, 78 56 C 78 68, 68 72, 50 72 C 32 72, 22 68, 22 56 Z"
              fill="url(#goldGradient)"
              stroke="#fef08a"
              strokeWidth="2"
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />

            {/* Slash Cuts on Bread */}
            <path
              d="M 36 46 Q 40 54 42 62 M 48 44 Q 52 54 54 64 M 60 46 Q 64 54 66 62"
              stroke="#78350f"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Sparkle Shine Cross */}
            <motion.path
              d="M 72 24 L 74 20 L 76 24 L 80 26 L 76 28 L 74 32 L 72 28 L 68 26 Z"
              fill="#ffffff"
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </svg>
        </div>
      </div>

      {/* Brand Typography with Modern Slide-in Animation */}
      {showText && (
        <motion.div
          initial={{ opacity: 0, x: 22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2 text-right select-none"
        >
          <motion.span
            animate={{
              x: [0, -3, 0],
              opacity: [0.9, 1, 0.9],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className={`${currentSize.font} font-black bg-gradient-to-l from-amber-600 via-stone-900 to-amber-700 dark:from-amber-400 dark:via-stone-100 dark:to-amber-500 bg-clip-text text-transparent tracking-tight leading-none drop-shadow-xs`}
          >
            خبزة
          </motion.span>
          <motion.span
            animate={{
              x: [0, -2, 0],
              opacity: [0.8, 1, 0.8],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
            className="text-amber-600 dark:text-amber-400 font-black text-xs tracking-wider uppercase"
          >
            Khobza
          </motion.span>
        </motion.div>
      )}
    </div>
  );
};
