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
} from '@fortawesome/free-solid-svg-icons';
import type { ChatMessage, ChatUser, Conversation, User } from '@/types/domain';
import ChatUserPicker from '@/components/chat-user-picker';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedPeer) return;
    await onSendMessage(inputText, selectedPeer);
    setInputText('');
  };

  const currentContact = localConversations.find(c => c.peer_id === selectedPeer);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[580px] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Sidebar Contacts */}
        <div className="w-1/3 border-r border-[#e8ede8] bg-[#f8faf8] flex flex-col">
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
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#edf2ee]">
            {localConversations.map(c => (
              <button
                key={c.peer_id}
                onClick={() => {
                  setSelectedPeer(c.peer_id);
                  onSelectPeer(c.peer_id);
                }}
                className={`w-full text-left p-3.5 transition flex items-center gap-3 ${
                  selectedPeer === c.peer_id ? 'bg-white shadow-sm font-semibold' : 'hover:bg-white/60'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e3f0e8] text-[#176b52] font-bold text-xs">
                  {c.peer_role === 'SHOP' ? (
                    <FontAwesomeIcon icon={faStore} />
                  ) : c.peer_role === 'ADMIN' ? (
                    <FontAwesomeIcon icon={faUserShield} />
                  ) : (
                    <FontAwesomeIcon icon={faUser} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-[#1f2d25] truncate">{c.peer_name}</span>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#7d8f85] truncate">{c.last_message}</div>
                </div>
              </button>
            ))}

            {localConversations.length === 0 && (
              <div className="p-6 text-center text-xs text-[#809187]">Chưa có cuộc trò chuyện nào.</div>
            )}
          </div>
        </div>

        {/* Chat Main Area */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Header */}
          <div className="p-4 border-b border-[#e8ede8] flex justify-between items-center">
            <div>
              <div className="text-sm font-extrabold text-[#1e2e26]">
                {currentContact?.peer_name || 'Hỗ trợ FreshFlow'}
              </div>
              <div className="text-[10px] text-[#7e8f85]">
                {currentContact?.peer_role === 'SHOP'
                  ? 'Cửa hàng nông sản liên kết'
                  : currentContact?.peer_role === 'ADMIN'
                  ? 'Quản trị viên FreshFlow'
                  : 'Người dùng'}
              </div>
            </div>

            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => {
              const isMe = m.sender_id === currentUser?.id;
              return (
                <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="text-[10px] text-[#86968d] mb-1">
                    {m.sender_name} · {new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div
                    className={`max-w-[75%] rounded-2xl p-3 text-xs leading-relaxed ${
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
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <form onSubmit={handleSend} className="p-3 border-t border-[#e8ede8] flex items-center gap-2">
            <input
              type="text"
              placeholder="Nhập nội dung tin nhắn..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              className="flex-1 rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
            />
            <button
              type="submit"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#176b52] text-white shadow hover:bg-[#125340]"
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
          onSelectPeer(u.id, u);
        }}
        currentUserRole={currentUser?.role}
      />
    </div>
  );
}
