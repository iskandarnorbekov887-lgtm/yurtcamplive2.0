'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { supabase, type Profile, type Message, type MessageThread } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function MessagesPage() {
  return (
    <ProtectedRoute allowedRoles={['CEO', 'Manager', 'Cook', 'Reserver', 'Observer']}>
      <MessagesDashboard />
    </ProtectedRoute>
  );
}

function MessagesDashboard() {
  const { user, signOut } = useAuth();
  const currentUserId = user?.id;
  const { t } = useLanguage();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChat, setShowNewChat] = useState(false);

  useEffect(() => {
    fetchData();

    // Check if user parameter is in URL to start chat with specific user
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('user');
    if (targetUserId && currentUserId) {
      handleCreateNewChat(targetUserId);
    }

    const interval = setInterval(() => {
      if (selectedThread) {
        fetchMessages(selectedThread.id);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedThread]);

  const fetchData = async () => {
    try {
      const [threadsData, contactsData] = await Promise.all([
        supabase.from('message_threads').select('*').or(`participants.cs.{${currentUserId}}`),
        supabase.from('profiles').select('*').neq('id', currentUserId || ''),
      ]);

      setThreads(threadsData.data || []);
      setContacts(contactsData.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (threadId: number) => {
    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleSelectThread = (thread: MessageThread) => {
    setSelectedThread(thread);
    fetchMessages(thread.id);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedThread || !currentUserId) return;

    try {
      const otherParticipantId = selectedThread.participants.find(p => p !== currentUserId);
      if (!otherParticipantId) return;

      await supabase.from('messages').insert({
        thread_id: selectedThread.id,
        sender_id: currentUserId,
        receiver_id: otherParticipantId,
        content: newMessage,
        read: false,
        created_at: new Date().toISOString(),
      });

      await supabase.from('message_threads').update({
        updated_at: new Date().toISOString(),
      }).eq('id', selectedThread.id);

      setNewMessage('');
      fetchMessages(selectedThread.id);
      fetchData();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleCreateNewChat = async (contactId: string) => {
    try {
      const { data } = await supabase.from('message_threads').insert({
        participants: [currentUserId, contactId],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single();

      if (data) {
        setShowNewChat(false);
        fetchData();
        handleSelectThread(data);
      }
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-indigo-900 font-medium animate-pulse">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800">Messages</h1>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Team Communication</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button onClick={signOut} className="px-5 py-2.5 bg-rose-600/90 hover:bg-rose-600 rounded-xl text-xs font-black transition-all shadow-lg hover:shadow-rose-500/20 active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {t('btn.logout')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden h-[calc(100vh-200px)]">
          <div className="flex h-full">
            {/* Sidebar - Threads */}
            <div className="w-80 border-r border-slate-100 flex flex-col">
              <div className="p-4 border-b border-slate-100">
                <button
                  onClick={() => setShowNewChat(true)}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threads.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <p className="text-sm">No conversations yet</p>
                  </div>
                ) : (
                  threads.map((thread) => {
                    const otherParticipantId = thread.participants.find(p => p !== currentUserId);
                    const contact = contacts.find(c => c.id === otherParticipantId);
                    return (
                      <button
                        key={thread.id}
                        onClick={() => handleSelectThread(thread)}
                        className={`w-full p-4 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                          selectedThread?.id === thread.id ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                            {contact?.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 truncate">{contact?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {contact?.role} • {new Date(thread.updated_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
              {selectedThread ? (
                <>
                  {/* Chat Header */}
                  <div className="p-4 border-b border-slate-100">
                    {(() => {
                      const otherParticipantId = selectedThread.participants.find(p => p !== currentUserId);
                      const contact = contacts.find(c => c.id === otherParticipantId);
                      return (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                            {contact?.full_name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{contact?.full_name || 'Unknown'}</p>
                            <p className="text-xs text-slate-500">{contact?.role}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message) => {
                      const isOwn = message.sender_id === currentUserId;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-md px-4 py-2 rounded-2xl ${
                              isOwn
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            <p className="text-sm font-bold">{message.content}</p>
                            <p className={`text-xs mt-1 ${isOwn ? 'text-indigo-200' : 'text-slate-500'}`}>
                              {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Message Input */}
                  <div className="p-4 border-t border-slate-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-black bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim()}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-lg font-bold">Select a conversation to start messaging</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* New Chat Modal */}
        {showNewChat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewChat(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-slate-800 mb-4">Start New Chat</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleCreateNewChat(contact.id)}
                    className="w-full p-3 text-left hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                      {contact.full_name?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{contact.full_name}</p>
                      <p className="text-xs text-slate-500">{contact.role}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowNewChat(false)}
                className="w-full mt-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
