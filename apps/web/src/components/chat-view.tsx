'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faComments,
  faPaperPlane,
  faSearch,
  faStore,
  faTruck,
  faUser,
  faUserPlus,
  faUserShield,
} from '@fortawesome/free-solid-svg-icons';
import type { ChatMessage, ChatUser, Conversation, User } from '@/types/domain';
import ChatUserPicker from '@/components/chat-user-picker';
import UserAvatar from '@/components/user-avatar';

interface ChatViewProps {
  currentUser?: User;
  conversations: Conversation[];
  activePeerId?: number;
  messages: ChatMessage[];
  onSelectPeer: (peerId: number) => void;
  onSendMessage: (content: string, peerId?: number, orderId?: number) => Promise<void>;
  onNewConversation?: (peer: ChatUser) => void;
}

export default function ChatView({
  currentUser,
  conversations,
  activePeerId,
  messages,
  onSelectPeer,
  onSendMessage,
  onNewConversation,
}: ChatViewProps) {
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [localConversations, setLocalConversations] = useState<Conversation[]>(conversations);
  const [selectedPeer, setSelectedPeer] = useState<number | undefined>(
    activePeerId || conversations[0]?.peer_id
  );
  const threadRef = useRef<HTMLDivElement>(null);
  // Phones show either the conversation list or the open thread.
  const [mobilePane, setMobilePane] = useState<'list' | 'thread'>(activePeerId ? 'thread' : 'list');

  useEffect(() => {
    setLocalConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    if (activePeerId) {
      setSelectedPeer(activePeerId);
    } else if (!selectedPeer && localConversations.length > 0) {
      setSelectedPeer(localConversations[0].peer_id);
      onSelectPeer(localConversations[0].peer_id);
    }
  }, [activePeerId, localConversations, onSelectPeer, selectedPeer]);

  // Scroll only the message pane (scrollIntoView would also scroll the page on mobile).
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedPeer, mobilePane]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedPeer) return;
    const text = inputText;
    setInputText('');
    await onSendMessage(text, selectedPeer);
  };

  const handleSelectUserFromPicker = (user: ChatUser) => {
    const existing = localConversations.find(c => c.peer_id === user.id);
    if (!existing) {
      const newEntry: Conversation = {
        peer_id: user.id,
        peer_name: user.shop_name || user.full_name,
        peer_role: user.role,
        avatar_url: user.avatar_url,
        last_message: 'Bắt đầu cuộc trò chuyện...',
        last_time: new Date().toISOString(),
        unread: 0,
        order_id: null,
      };
      setLocalConversations(prev => [newEntry, ...prev]);
    }
    setSelectedPeer(user.id);
    setMobilePane('thread');
    onSelectPeer(user.id);
    if (onNewConversation) onNewConversation(user);
  };

  const currentContact = localConversations.find(c => c.peer_id === selectedPeer);

  const filteredConversations = localConversations.filter(c => {
    if (filterUnread && c.unread === 0) return false;
    if (searchTerm.trim()) {
      return (
        c.peer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.last_message.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

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

  const getRoleIcon = (role?: string) => {
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
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[260px] w-full overflow-hidden rounded-2xl border border-[#e8ede8] bg-white shadow-sm sm:h-[calc(100dvh-12rem)] lg:h-[min(720px,calc(100dvh-11rem))]">
      {/* SIDEBAR: CONTACTS LIST */}
      <div className={`${mobilePane === 'thread' ? 'hidden' : 'flex'} w-full min-w-0 flex-col border-r border-[#e8ede8] bg-[#f8faf8] md:flex md:w-72 lg:w-80`}>
        {/* Header with Title and Add User Button */}
        <div className="p-4 border-b border-[#e8ede8] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-[#1e2e26] flex items-center gap-2">
              <FontAwesomeIcon icon={faComments} className="text-[#176b52]" />
              Tin nhắn & Trò chuyện
            </h3>
            <button
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#176b52] px-3 py-1.5 text-xs font-bold text-white shadow transition hover:bg-[#125340]"
              title="Bắt đầu trò chuyện mới hoặc chọn người nhắn tin"
            >
              <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
              <span>Mới</span>
            </button>
          </div>

          {/* Search Contacts */}
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-2.5 text-xs text-[#8d9e93]" />
            <input
              type="search"
              placeholder="Tìm kiếm người nhắn..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-[#d2ddd5] py-1.5 pl-8 pr-3 text-base focus:border-[#176b52] focus:outline-none sm:text-xs"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-2 text-[11px] font-semibold">
            <button
              onClick={() => setFilterUnread(false)}
              className={`rounded-lg px-2.5 py-1 transition ${
                !filterUnread ? 'bg-white font-bold text-[#176b52] shadow-sm' : 'text-[#64776b] hover:bg-white/60'
              }`}
            >
              Tất cả ({localConversations.length})
            </button>
            <button
              onClick={() => setFilterUnread(true)}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterUnread ? 'bg-white font-bold text-[#176b52] shadow-sm' : 'text-[#64776b] hover:bg-white/60'
              }`}
            >
              Chưa đọc ({localConversations.filter(c => c.unread > 0).length})
            </button>
          </div>
        </div>

        {/* Conversation Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#edf2ee]">
          {filteredConversations.map(c => {
            const isSelected = selectedPeer === c.peer_id;
            const meta = getRoleBadge(c.peer_role);
            const icon = getRoleIcon(c.peer_role);

            return (
              <button
                key={c.peer_id}
                onClick={() => {
                  setSelectedPeer(c.peer_id);
                  setMobilePane('thread');
                  onSelectPeer(c.peer_id);
                }}
                className={`w-full text-left p-3.5 transition flex items-start gap-3 ${
                  isSelected ? 'bg-white shadow-sm font-semibold border-l-4 border-l-[#176b52]' : 'hover:bg-white/70'
                }`}
              >
                {c.avatar_url ? (
                  <UserAvatar name={c.peer_name} avatarUrl={c.avatar_url} size="md" verified className="mt-0.5" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e3f0e8] text-[#176b52] font-bold text-xs mt-0.5">
                    <FontAwesomeIcon icon={icon} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-[#1f2d25] truncate">{c.peer_name}</span>
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${meta.bg}`}>
                        {meta.label}
                      </span>
                    </div>
                    {c.last_time && (
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(c.last_time).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <span className="text-[11px] text-[#7d8f85] truncate">{c.last_message}</span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {filteredConversations.length === 0 && (
            <div className="p-8 text-center text-xs text-[#809187]">
              <p>Không có cuộc trò chuyện nào.</p>
              <button
                onClick={() => setIsPickerOpen(true)}
                className="mt-3 text-xs font-bold text-[#176b52] hover:underline"
              >
                + Bấm vào đây để chọn người nhắn tin
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className={`${mobilePane === 'list' ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col bg-white md:flex`}>
        {selectedPeer && currentContact ? (
          <>
            {/* Active Contact Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e8ede8] bg-white p-2.5 sm:p-4">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setMobilePane('list')}
                  aria-label="Quay lại danh sách hội thoại"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#176b52] hover:bg-slate-50 md:hidden"
                >
                  <FontAwesomeIcon icon={faArrowLeft} />
                </button>
                {currentContact.avatar_url ? (
                  <UserAvatar name={currentContact.peer_name} avatarUrl={currentContact.avatar_url} size="md" verified />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#e3f0e8] text-[#176b52] font-bold">
                    <FontAwesomeIcon icon={getRoleIcon(currentContact.peer_role)} />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-extrabold text-[#1e2e26]">
                      {currentContact.peer_name}
                    </span>
                    <span
                      className={`inline-block rounded border px-2 py-0.5 text-[10px] font-bold leading-none ${
                        getRoleBadge(currentContact.peer_role).bg
                      }`}
                    >
                      {getRoleBadge(currentContact.peer_role).label}
                    </span>
                  </div>
                  <div className="mt-0.5 hidden text-[11px] text-[#7e8f85] sm:block">
                    Đang hoạt động trên FreshFlow
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsPickerOpen(true)}
                aria-label="Đổi người nhắn tin"
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#d2ddd5] px-2.5 py-1.5 text-xs font-bold text-[#4c5f53] hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faUserPlus} className="text-xs text-[#176b52]" />
                <span className="hidden sm:inline">Đổi người nhắn tin</span>
              </button>
            </div>

            {/* Messages Thread */}
            <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[#fbfdfb] p-3 sm:p-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-6 text-xs text-[#809187]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f2ec] text-[#176b52] text-xl mb-2">
                    <FontAwesomeIcon icon={faComments} />
                  </div>
                  <p className="font-bold text-sm text-[#1e2d25]">Chưa có tin nhắn nào</p>
                  <p className="mt-1 max-w-sm text-[#7a8b80]">
                    Hãy gửi lời chào hoặc bắt đầu trao đổi về sản phẩm, đơn hàng hoặc hỗ trợ trực tiếp.
                  </p>
                </div>
              ) : (
                messages.map(m => {
                  const isMe = m.sender_id === currentUser?.id;
                  return (
                    <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="text-[10px] text-[#86968d] mb-1">
                        {m.sender_name} ·{' '}
                        {new Date(m.created_at).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div
                        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl p-3 text-[13px] leading-relaxed sm:max-w-[75%] sm:p-3.5 sm:text-xs ${
                          isMe
                            ? 'bg-[#176b52] text-white rounded-br-none shadow-sm'
                            : 'bg-[#edf3ef] text-[#1c2c23] rounded-bl-none border border-[#e1e9e3]'
                        }`}
                      >
                        {m.content}
                        {m.image_url && (
                          <img
                            src={m.image_url}
                            alt="chat attachment"
                            className="mt-2 rounded-lg max-h-48"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Message Input Box (16px text on phones so iOS does not zoom when focusing) */}
            <form onSubmit={handleSend} className="flex shrink-0 items-center gap-2 border-t border-[#e8ede8] bg-white p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:p-3.5">
              <input
                type="text"
                placeholder="Nhập tin nhắn…"
                aria-label="Nội dung tin nhắn"
                enterKeyHint="send"
                autoComplete="off"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onFocus={e => {
                  const field = e.currentTarget;
                  // After the virtual keyboard opens, keep the input and the latest messages visible.
                  setTimeout(() => {
                    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
                    field.scrollIntoView({ block: "nearest" });
                  }, 300);
                }}
                className="min-w-0 flex-1 rounded-xl border border-[#d2ddd5] px-3 py-2.5 text-base focus:border-[#176b52] focus:outline-none sm:text-xs"
              />
              <button
                type="submit"
                aria-label="Gửi tin nhắn"
                disabled={!inputText.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#176b52] text-white shadow transition hover:bg-[#125340] disabled:opacity-40 sm:h-10 sm:w-10"
              >
                <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f2ec] text-[#176b52] text-2xl mb-3">
              <FontAwesomeIcon icon={faComments} />
            </div>
            <h3 className="text-base font-extrabold text-[#1a2d23]">Trung tâm Trò chuyện Realtime</h3>
            <p className="mt-1 max-w-sm text-xs text-[#798a7f]">
              Chọn một liên hệ từ danh sách bên trái hoặc bấm nút dưới đây để chọn người nhắn tin.
            </p>
            <button
              onClick={() => setIsPickerOpen(true)}
              className="mt-4 flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#125340]"
            >
              <FontAwesomeIcon icon={faUserPlus} />
              Chọn người nhắn tin
            </button>
          </div>
        )}
      </div>

      {/* User Selection Modal */}
      <ChatUserPicker
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectUser={handleSelectUserFromPicker}
        currentUserRole={currentUser?.role}
      />
    </div>
  );
}
