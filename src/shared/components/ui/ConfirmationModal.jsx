import React from 'react';
import Modal from '@/shared/components/ui/Modal';
import Button from '@/shared/components/ui/Button';
import { AlertTriangle, Trash2 } from 'lucide-react';

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger", // 'danger' | 'warning' | 'primary'
  loading = false,
  icon: Icon = variant === 'danger' ? Trash2 : AlertTriangle
}) {
  const confirmButtonClass = variant === 'danger' 
    ? 'bg-red-500 hover:bg-red-600 border-none text-white' 
    : variant === 'warning' 
      ? 'bg-amber-500 hover:bg-amber-600 border-none text-white'
      : 'bg-primary hover:opacity-90 border-none text-white';

  const iconWrapperClass = variant === 'danger'
    ? 'bg-red-500/10 border-red-500/20 text-red-500'
    : variant === 'warning'
      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
      : 'bg-primary/10 border-primary/20 text-primary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      actions={
        <>
          <button
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors cursor-pointer"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <Button
            className={confirmButtonClass}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center py-2">
        <div className={`w-14 h-14 rounded-full border flex items-center justify-center mb-4 ${iconWrapperClass}`}>
          <Icon size={24} />
        </div>
        <p className="text-gray-300 text-sm leading-relaxed max-w-[280px]">
          {description}
        </p>
      </div>
    </Modal>
  );
}
