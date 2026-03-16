import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Send, User, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
  jobsite_id?: string;
  jobsite_group?: string;
  employees?: { role: string };
}

interface ChatProps {
  jobsiteId?: string;
  jobsiteGroup?: string;
  jobsiteName?: string;
  highlightKeyword?: string;
}

export default function Chat({ jobsiteId, jobsiteGroup, jobsiteName, highlightKeyword }: ChatProps) {
  const { user, employee } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const highlightedMessageRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  
  const channelName = jobsiteGroup ? `chat:group:${jobsiteGroup}` : jobsiteId ? `chat:jobsite:${jobsiteId}` : 'chat:general';

  useEffect(() => {
    // Scroll to bottom when messages change, unless we have a highlighted message
    if (!highlightKeyword) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, highlightKeyword]);

  useEffect(() => {
    if (highlightKeyword && highlightedMessageRef.current) {
      highlightedMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightKeyword, messages]);

  useEffect(() => {
    if (!user) return;

    // Request notification permission
    if ('Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission();
    }

    // Load initial messages from DB
    const fetchMessages = async () => {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100);
        
      if (jobsiteGroup) {
        const { data: jobsites } = await supabase
          .from('jobsites')
          .select('id')
          .eq('jobsite_group', jobsiteGroup);
        const jobsiteIds = jobsites?.map(js => js.id) || [];
        
        let filter = `jobsite_group.eq.${jobsiteGroup},jobsite_group.eq.GENERAL`;
        if (jobsiteIds.length > 0) {
          filter += `,jobsite_id.in.(${jobsiteIds.join(',')})`;
        }
        query = query.or(filter);
      } else if (jobsiteId) {
        query = query.or(`jobsite_id.eq.${jobsiteId},jobsite_group.eq.GENERAL`);
      } else {
        query = query.or('jobsite_id.is.null,jobsite_group.is.null');
      }

      const { data: messagesData, error: messagesError } = await query;
      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        return;
      }

      // Fetch employees to get roles
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, role');
        
      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
      }

      const employeeMap = new Map(employeesData?.map(e => [e.id, e.role]));
      
      const messagesWithRoles = messagesData?.map(msg => ({
        ...msg,
        employees: employeeMap.has(msg.user_id) ? { role: employeeMap.get(msg.user_id) } : undefined
      })).filter(msg => msg.user_name !== 'System');
      
      const messagesWithAdminName = messagesWithRoles?.map(msg => ({
        ...msg,
        user_name: (!jobsiteId && !jobsiteGroup) ? 'Admin' : msg.user_name
      }));

      setMessages(messagesWithAdminName as Message[]);
    };

    fetchMessages();

    // Subscribe to new messages via Postgres changes
    const subscribeToMessages = async () => {
      let filter = 'jobsite_id=is.null';
      if (jobsiteGroup) {
        const { data: jobsites } = await supabase
          .from('jobsites')
          .select('id')
          .eq('jobsite_group', jobsiteGroup);
        const jobsiteIds = jobsites?.map(js => js.id) || [];
        
        filter = `or=(jobsite_group.eq.${jobsiteGroup},jobsite_group.eq.GENERAL`;
        if (jobsiteIds.length > 0) {
          filter += `,jobsite_id.in.(${jobsiteIds.join(',')})`;
        }
        filter += ')';
      } else if (jobsiteId) {
        filter = `jobsite_id=eq.${jobsiteId}`;
      } else {
        filter = 'or=(jobsite_id.is.null,jobsite_group.is.null)';
      }

      const channel = supabase.channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: filter,
          },
          (payload) => {
            const msg = payload.new as Message;
            if (msg.user_name === 'System') return;
            
            const msgWithAdminName = {
              ...msg,
              user_name: (!jobsiteId && !jobsiteGroup) ? 'Admin' : msg.user_name
            };

            setMessages((prev) => {
              // Prevent duplicates if we already added it optimistically
              if (prev.some(m => m.id === msg.id)) return prev;
              return [...prev, msgWithAdminName];
            });
            
            // Show browser notification if it's not from me and window is not focused
            if (msg.user_id !== user.id && 'Notification' in window && window.Notification.permission === 'granted' && document.hidden) {
              new window.Notification(`New message from ${msgWithAdminName.user_name}`, {
                body: msg.content,
                icon: '/logo.png'
              });
            }
          }
        )
        .subscribe();

      return channel;
    };

    subscribeToMessages().then(c => { channelRef.current = c; });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user, jobsiteId, jobsiteGroup, channelName]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !employee) return;

    const message: Message = {
      id: crypto.randomUUID(),
      user_id: user.id,
      user_name: (!jobsiteId && !jobsiteGroup) ? 'Admin' : `${employee.first_name} ${employee.last_name}`,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      jobsite_id: jobsiteId,
      jobsite_group: jobsiteGroup || (!jobsiteId ? 'GENERAL' : undefined),
    };

    // Optimistic update
    setMessages((prev) => [...prev, message]);
    setNewMessage('');

    // Insert into DB
    const { error } = await supabase.from('chat_messages').insert({
      id: message.id,
      user_id: message.user_id,
      user_name: message.user_name,
      content: message.content,
      jobsite_id: message.jobsite_id || null,
      jobsite_group: message.jobsite_group || null,
      created_at: message.created_at,
    });

    if (error) {
      console.error('Error sending message:', error);
      // If error, we could remove the optimistic message here
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden">
      <div className="p-4 border-b border-emerald-900/30 bg-[#050A08]">
        <h3 className="text-white font-bold">
          {jobsiteName ? `${jobsiteName} Crew Chat` : 'General Crew Chat'}
        </h3>
        <p className="text-xs text-gray-500">Real-time communication hub</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <User size={48} className="mb-4 opacity-20" />
            <p>No messages yet.</p>
            <p className="text-xs">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            const isAdmin = msg.employees?.role === 'admin';
            return (
              <div
                key={msg.id}
                ref={highlightKeyword && msg.content.toLowerCase().includes(highlightKeyword.toLowerCase()) ? highlightedMessageRef : null}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-xs font-bold ${isAdmin ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {isMe ? 'You' : msg.user_name} {isAdmin && <span className="text-[10px] bg-emerald-900/50 px-1 rounded ml-1">ADMIN</span>}
                  </span>
                  <span className="text-[10px] text-gray-600 flex items-center gap-1">
                    <Clock size={10} />
                    {format(new Date(msg.created_at), 'h:mm a')}
                  </span>
                </div>
                <div
                  className={`px-4 py-2 rounded-2xl max-w-[80%] ${
                    isMe
                      ? 'bg-emerald-500 text-black rounded-tr-sm'
                      : isAdmin
                      ? 'bg-emerald-900/20 text-emerald-100 border border-emerald-500/30 rounded-tl-sm'
                      : 'bg-white/5 text-white border border-white/10 rounded-tl-sm'
                  } ${highlightKeyword && msg.content.toLowerCase().includes(highlightKeyword.toLowerCase()) ? 'ring-2 ring-yellow-500' : ''}`}
                >
                  <p className="text-sm">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 bg-[#050A08] border-t border-emerald-900/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black p-3 rounded-xl transition-colors flex items-center justify-center"
          >
            <Send size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}
