import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Button from '@/shared/components/ui/Button';

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
  className = ''
}) {
  useEffect(() => {
    // We removed overflow: hidden to prevent the scrollbar from disappearing and causing layout jumps
  }, [isOpen]);

  if (!isOpen) return null;
  
  const modalRoot = document.body;

  return createPortal(
    <div 
      className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
      style={{ willChange: "opacity" }}
    >
      <div className="fixed inset-0 -z-10" onClick={onClose}></div>

      <div 
        className={`relative bg-[#121212] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 ${className}`}
        style={{ willChange: "transform, opacity" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 shrink-0">
          <h3 className="font-serif text-xl font-bold text-white tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto">
          {description && <p className="text-gray-400 text-sm mb-4">{description}</p>}
          {children}
        </div>

        {/* Footer Actions */}
        {actions && (
          <div className="p-5 border-t border-white/5 flex items-center justify-end gap-3 bg-white/[0.02] shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>,
    modalRoot
  );
}
