import React, { useEffect } from 'react';

interface ModalProps {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'max-w-md' | 'max-w-lg' | 'max-w-2xl';
}

/** Shared modal shell: overlay + centered panel with sane width, ESC and click-outside close. */
export const Modal: React.FC<ModalProps> = ({
  title,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-lg',
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${maxWidth} max-h-[90vh] overflow-auto bg-surface-container-lowest rounded-xl shadow-lg border border-outline-variant/20 p-lg space-y-md`}
      >
        <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
        {children}
        {footer && <div className="flex justify-end gap-sm">{footer}</div>}
      </div>
    </div>
  );
};
