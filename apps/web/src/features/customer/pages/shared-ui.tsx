'use client';

import React from 'react';

export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: string }) {
  const styles: Record<string, string> = {
    gray: 'bg-white text-slate-600',
    green: 'bg-white text-emerald-700',
    orange: 'bg-white text-amber-700',
    red: 'bg-white text-rose-700',
    blue: 'bg-white text-sky-700',
  };

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[tone] || styles.gray}`}>{children}</span>;
}

export function Button({ children, onClick, kind = 'primary', className = '', disabled = false }: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-[#176b52] text-white hover:bg-[#10563f]',
    secondary: 'border border-[#dfe7e1] bg-white text-[#263a31] hover:bg-white',
    quiet: 'text-[#176b52] hover:bg-white',
    danger: 'border border-rose-200 text-rose-600 hover:bg-white',
  };

  return <button disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${styles[kind]} ${className}`}>{children}</button>;
}
