'use client';

import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faStore,
  faTruck,
  faUser,
  faUserPlus,
  faUserShield,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { ChatUser, UserRole } from '@/types/domain';
import { freshflow } from '@/lib/api';

interface ChatUserPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser: (user: ChatUser) => void;
  currentUserRole?: string;
}

export default function ChatUserPicker({
  isOpen,
  onClose,
  onSelectUser,
  currentUserRole,
}: ChatUserPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;
    setLoading(true);

    const roleParam = selectedRole === 'ALL' ? undefined : selectedRole;
    freshflow
      .chatUsers<ChatUser>(search.trim() || undefined, roleParam)
      .then(res => {
        if (!isCancelled) {
          const list = Array.isArray(res) ? res : ((res as any)?.data ?? []);
          setUsers(list);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setUsers([]);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, search, selectedRole]);

  if (!isOpen) return null;

  const roleLabel = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'Quản trị viên', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'SHOP':
        return { label: 'Cửa hàng (Shop)', bg: 'bg-emerald-50 text-[#176b52] border-emerald-200' };
      case 'SHIPPER':
        return { label: 'Tài xế Shipper', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'CUSTOMER':
      default:
        return { label: 'Khách hàng', bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  const roleIcon = (role: UserRole) => {
    switch (role) {
      case 'ADMIN':
        return faUserShield;
      case 'SHOP':
        return faStore;
      case 'SHIPPER':
        return faTruck;
      case 'CUSTOMER':
      default:
        return faUser;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e8ede8] p-4 bg-[#f8faf8]">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e3f0e8] text-[#176b52]">
              <FontAwesomeIcon icon={faUserPlus} className="text-sm" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#1e2e26]">Chọn người để nhắn tin</h3>
              <p className="text-[11px] text-[#7d8f85]">
                {currentUserRole === 'ADMIN'
                  ? 'Quản trị viên có thể bắt đầu trò chuyện với bất kỳ người dùng nào'
                  : 'Bắt đầu cuộc trò chuyện mới trong hệ thống FreshFlow'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Search & Filter */}
        <div className="p-4 border-b border-[#edf2ee] space-y-3">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-3 text-xs text-[#8c9c92]" />
            <input
              type="text"
              placeholder="Tìm theo tên, tên Shop, SĐT hoặc email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#d2ddd5] py-2 pl-9 pr-3 text-xs focus:border-[#176b52] focus:outline-none"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'CUSTOMER', label: 'Khách hàng' },
              { id: 'SHOP', label: 'Cửa hàng (Shop)' },
              { id: 'SHIPPER', label: 'Shipper' },
              { id: 'ADMIN', label: 'Quản trị viên' },
            ].map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRole(r.id)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  selectedRole === r.id
                    ? 'bg-[#176b52] text-white shadow-sm'
                    : 'bg-[#f0f4f1] text-[#55695e] hover:bg-[#e4ece6]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* User List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#edf2ee] p-2">
          {loading && (
            <div className="p-8 text-center text-xs text-[#7e8f85]">
              Đang tải danh sách người dùng...
            </div>
          )}

          {!loading && users.length === 0 && (
            <div className="p-8 text-center text-xs text-[#7e8f85]">
              Không tìm thấy người dùng phù hợp.
            </div>
          )}

          {!loading &&
            users.map(u => {
              const meta = roleLabel(u.role);
              const icon = roleIcon(u.role);
              const displayName = u.shop_name || u.full_name;

              return (
                <button
                  key={u.id}
                  onClick={() => {
                    onSelectUser(u);
                    onClose();
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition hover:bg-[#f6f9f6]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3f0e8] text-[#176b52]">
                      <FontAwesomeIcon icon={icon} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-[#1f2d25]">{displayName}</span>
                        {u.shop_name && u.full_name !== u.shop_name && (
                          <span className="text-[10px] text-slate-400">({u.full_name})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#7d8f85] truncate">
                        {u.phone || u.email}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${meta.bg}`}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
