import React from 'react';

interface SuccessPanelProps {
  icon: string;
  title: string;
  description?: string;
  className?: string;
}

export const SuccessPanel: React.FC<SuccessPanelProps> = ({ icon, title, description, className = '' }) => (
  <div className={`p-xl text-center py-20 bg-surface-container-lowest rounded-xl shadow-md border border-outline-variant/30 flex flex-col items-center gap-md ${className}`}>
    <div className="w-16 h-16 rounded-full bg-tertiary-container text-on-tertiary-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[36px]">{icon}</span>
    </div>
    <h2 className="font-headline-lg text-headline-lg text-on-surface">{title}</h2>
    {description && <p className="font-body-lg text-body-lg text-on-surface-variant">{description}</p>}
  </div>
);