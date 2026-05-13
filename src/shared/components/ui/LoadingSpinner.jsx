import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingSpinner = ({ fullScreen = true, message = "Loading...", size = "w-10 h-10" }) => {
  const content = (
    <div className={`flex flex-col items-center justify-center ${message ? 'gap-4' : ''} animate-in fade-in duration-500`}>
      <div className="relative">
        {/* Outer glow ring */}
        <div className={`absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse ${size === 'w-10 h-10' ? 'block' : 'hidden'}`} />
        
        {/* Spinner */}
        <Loader2 className={`${size} text-primary animate-spin relative z-10`} />
      </div>
      
      {message && (
        <p className="text-[10px] font-bold text-primary/60 tracking-[0.2em] uppercase animate-pulse">
          {message}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
};

export default LoadingSpinner;
