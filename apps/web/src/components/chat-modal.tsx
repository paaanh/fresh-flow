'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faComments,
  faImage,
  faPaperPlane,
  faStore,
  faTruck,
  faUser,
  faUserPlus,
  faUserShield,
  faXmark,
  faArrowLeft,
} from '@fortawesome/free-solid-svg-icons';
import type { ChatMessage, ChatUser, Conversation, User } from '@/types/domain';
import ChatUserPicker from '@/components/chat-user-picker';
import UserAvatar from '@/components/user-avatar';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: User;
  conversations: Conversation[];
  activePeerId?: number;
  messages: ChatMessage[];
  onSelectPeer: (peerId: number, peerUser?: ChatUser) => void;
  onSendMessage: (content: string, peerId?: number, orderId?: number) => Promise<void>;
}

export default function ChatModal({
  isOpen,
  onClose,
  currentUser,
  conversations,
  activePeerId,
  messages,
  onSelectPeer,
  onSendMessage,
}: ChatModalProps) {
  const [inputText, setInputText] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [localConversations, setLocalConversations] = useState<Conversation[]>(conversations);
  const [selectedPeer, setSelectedPeer] = useState<number | undefined>(activePeerId || conversations[0]?.peer_id);
  const threadRef = useRef<HTMLDivElement>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>('thread');

  useEffect(() => {
    setLocalConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    if (activePeerId) {
      setSelectedPeer(activePeerId);
    } else if (!selectedPeer && localConversations.length > 0) {
      setSelectedPeer(localConversations[0].peer_id);
    }
  }, [activePeerId, localConversations, selectedPeer]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedPeer, mobilePane, isOpen]);

  // Lock page scroll behind the chat while it is open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedPeer) return;
    await onSendMessage(inputText, selectedPeer);
    setInputText('');
  };

  const currentContact = localConversations.find(c => c.peer_id === selectedPeer);

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return { label: 'Admin', bg: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'SHOP':
        return { label: 'Shop', bg: 'bg-emerald-50 text-[#176b52] border-emerald-200' };
      case 'SHIPPER':
        return { label: 'Shipper', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'CUSTOMER':
      default:
        return { label: 'Khách hàng', bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Tin nhắn">
      <div className="flex h-[100dvh] w-full max-w-3xl overflow-hidden bg-white shadow-2xl sm:h-[min(580px,calc(100dvh-2rem))] sm:rounded-2xl">
        {/* Sidebar Contacts */}
        <div className={`${mobilePane === 'thread' && selectedPeer ? 'hidden' : 'flex'} w-full min-w-0 flex-col border-r border-[#e8ede8] bg-[#f8faf8] sm:flex sm:w-1/3`}>
          <div className="p-3.5 border-b border-[#e8ede8] flex items-center justify-between">
            <h3 className="font-extrabold text-xs text-[#1e2e26] flex items-center gap-1.5">
              <FontAwesomeIcon icon={faComments} className="text-[#176b52]" />
              Tin nhắn
            </h3>
            <button
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-[#176b52] px-2 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-[#125340]"
              title="Chọn người nhắn tin"
            >
              <FontAwesomeIcon icon={faUserPlus} className="text-[10px]" />
              <span>Chọn người</span>
            </button>
            <button type="button" onClick={onClose} aria-label="Đóng tin nhắn" className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 sm:hidden">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#edf2ee]">
            {localConversations.map(c => {
              const badge = getRoleBadge(c.peer_role);
              return (
              <button
                key={c.peer_id}
                onClick={() => {
                  setSelectedPeer(c.peer_id);
                  setMobilePane('thread');
                  onSelectPeer(c.peer_id);
                }}
                className={`w-full text-left p-3.5 transition flex items-center gap-3 ${
                  selectedPeer === c.peer_id ? 'bg-white shadow-sm font-semibold' : 'hover:bg-white/60'
                }`}
              >
                {c.avatar_url ? (
                  <UserAvatar name={c.peer_name} avatarUrl={c.avatar_url} size="md" verified />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3f0e8] text-[#176b52] font-bold text-xs">
                    {c.peer_role === 'SHOP' ? (
                      <FontAwesomeIcon icon={faStore} />
                    ) : c.peer_role === 'ADMIN' ? (
                      <FontAwesomeIcon icon={faUserShield} />
                    ) : c.peer_role === 'SHIPPER' ? (
                      <FontAwesomeIcon icon={faTruck} />
                    ) : (
                      <FontAwesomeIcon icon={faUser} />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-[#1f2d25] truncate">{c.peer_name}</span>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#7d8f85] truncate">{c.last_message}</div>
                </div>
              </button>
              );
            })}

            {localConversations.length === 0 && (
              <div className="p-6 text-center text-xs text-[#809187]">Chưa có cuộc trò chuyện nào.</div>
            )}
          </div>
        </div>

        {/* Chat Main Area */}
        <div className={`${mobilePane === 'list' || !selectedPeer ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col bg-white sm:flex`}>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e8ede8] p-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:p-4">
            <button
              type="button"
              onClick={() => setMobilePane('list')}
              aria-label="Danh sách hội thoại"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#176b52] hover:bg-slate-50 sm:hidden"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-extrabold text-[#1e2e26]">
                  {currentContact?.peer_name || 'Hỗ trợ FreshFlow'}
                </span>
                {currentContact?.peer_role && (
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      getRoleBadge(currentContact.peer_role).bg
                    }`}
                  >
                    {getRoleBadge(currentContact.peer_role).label}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-[#7e8f85]">
                Đang hoạt động trên FreshFlow
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Đóng tin nhắn"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          {/* Messages List */}
          <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
            {messages.map(m => {
              const isMe = m.sender_id === currentUser?.id;
              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="text-[10px] text-[#86968d] mb-1">
                    {m.sender_name} · {new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl p-3 text-[13px] leading-relaxed sm:max-w-[75%] sm:text-xs ${
                      isMe
                        ? 'bg-[#176b52] text-white rounded-br-none shadow-sm'
                        : 'bg-[#f0f4f1] text-[#1c2c23] rounded-bl-none'
                    }`}
                  >
                    {m.content}
                    {m.image_url && (
                      <img src={m.image_url} alt="chat attachment" className="mt-2 rounded-lg max-h-40" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-[#e8ede8] p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-3">
            <input
              type="text"
              placeholder="Nhập tin nhắn…"
              aria-label="Nội dung tin nhắn"
              enterKeyHint="send"
              autoComplete="off"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onFocus={() => setTimeout(() => threadRef.current && (threadRef.current.scrollTop = threadRef.current.scrollHeight), 250)}
              className="min-w-0 flex-1 rounded-xl border border-[#d2ddd5] px-3 py-2.5 text-base focus:border-[#176b52] focus:outline-none sm:text-xs"
            />
            <button
              type="submit"
              aria-label="Gửi tin nhắn"
              disabled={!inputText.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#176b52] text-white shadow hover:bg-[#125340] disabled:opacity-40 sm:h-10 sm:w-10"
            >
              <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
            </button>
          </form>
        </div>
      </div>

      <ChatUserPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectUser={u => {
          setLocalConversations(prev => {
            if (prev.some(c => c.peer_id === u.id)) return prev;
            return [
              {
                peer_id: u.id,
                peer_name: u.shop_name || u.full_name,
                peer_role: u.role,
                avatar_url: u.avatar_url,
                last_message: 'Bắt đầu cuộc trò chuyện...',
                last_time: new Date().toISOString(),
                unread: 0,
                order_id: null,
              },
              ...prev,
            ];
          });
          setSelectedPeer(u.id);
          setMobilePane('thread');
          onSelectPeer(u.id, u);
        }}
        currentUserRole={currentUser?.role}
      />
    </div>
  );
}
