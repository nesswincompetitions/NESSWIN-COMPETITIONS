import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { m as motion, AnimatePresence } from 'framer-motion';

export default function Tooltip({ children, content, position = 'top' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const triggerRef = useRef(null);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updateCoords();
      window.addEventListener('scroll', updateCoords);
      window.addEventListener('resize', updateCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isVisible]);

  const getPositionStyles = () => {
    const space = 8;
    switch (position) {
      case 'top':
        return {
          top: coords.top - space,
          left: coords.left + coords.width / 2,
          transform: 'translate(-50%, -100%)'
        };
      case 'bottom':
        return {
          top: coords.top + coords.height + space,
          left: coords.left + coords.width / 2,
          transform: 'translateX(-50%)'
        };
      default:
        return { top: coords.top, left: coords.left };
    }
  };

  return (
    <div 
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {createPortal(
        <AnimatePresence>
          {isVisible && content && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: position === 'top' ? 5 : -5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: position === 'top' ? 5 : -5 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: 'absolute',
                ...getPositionStyles(),
                zIndex: 9999,
                pointerEvents: 'none'
              }}
              className="px-3 py-2 text-xs font-medium text-white bg-zinc-900 border border-white/10 rounded-lg shadow-2xl whitespace-normal min-w-40 max-w-64 break-words"
            >
              {content}
              <div 
                className={`absolute border-4 border-transparent ${
                  position === 'top' 
                    ? 'top-full left-1/2 -translate-x-1/2 border-t-zinc-900' 
                    : 'bottom-full left-1/2 -translate-x-1/2 border-b-zinc-900'
                }`} 
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
