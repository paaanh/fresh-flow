'use client';

import React, { useState } from 'react';
import { API_BASE } from '@/lib/api';

export function resolveAvatarUrl(url?: string | null): string | null {
  if (!url || !url.trim()) return null;
  const clean = url.trim();
  if (clean.startsWith('/media/')) {
    try {
      return `${new URL(API_BASE).origin}${clean}`;
    } catch {
      return clean;
    }
  }
  return clean;
}

interface UserAvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  verified?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
};

export default function UserAvatar({
  name,
  avatarUrl,
  size = 'sm',
  verified = false,
  className = '',
}: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const resolved = !imgError ? resolveAvatarUrl(avatarUrl) : null;
  const initials = (name || 'FF').trim().slice(0, 2).toUpperCase();

  return (
    <div className={`relative inline-flex shrink-0 ${SIZE_MAP[size]} ${className}`}>
      {resolved ? (
        <img
          src={resolved}
          alt={name || 'Avatar'}
          onError={() => setImgError(true)}
          className="h-full w-full rounded-full border border-[#d6e4db] object-cover bg-white shadow-xs"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-[#e8f5ec] font-extrabold text-[#176b52] border border-[#d6e4db]">
          {initials}
        </div>
      )}
      {verified && resolved && (
        <span
          title="Đã có ảnh đại diện xác thực người mua thật"
          className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-extrabold text-white ring-2 ring-white"
        >
          ✓
        </span>
      )}
    </div>
  );
}
