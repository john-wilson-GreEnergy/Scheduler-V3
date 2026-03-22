import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Send, User, Clock, Megaphone, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';

interface Message {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
  jobsite_id?: string;
  jobsite_group?: string;
  jobsite_group_name?: string;
  employees?: { role: string };
  attachments?: { file_url: string; file_name: string; file_type: string }[];
}

interface ChatProps {
  jobsiteId?: string;
  jobsiteGroup?: string;
  jobsiteGroupName?: string;
  jobsiteName?: string;
  highlightKeyword?: string;
  allJobsites?: any[];
}

export default function Chat({ jobsiteId, jobsiteGroup, jobsiteGroupName, jobsiteName, highlightKeyword, allJobsites }: ChatProps) {
  const { user, employee } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const highlightedMessageRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);
  const isSubscribedRef = useRef(false);
  
  const isBroadcast = jobsiteId === 'BROADCAST';
  const channelName = useMemo(() => {
    const groupName = jobsiteGroup ? jobsiteGroup.replace(/\s+/g, '_') : '';
    return isBroadcast ? 'chat:general' : jobsiteGroup ? `chat:group:${groupName}` : jobsiteId ? `chat:jobsite:${jobsiteId}` : 'chat:general';
  }, [isBroadcast, jobsiteGroup, jobsiteId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Send message with attachment
      const messageData = {
        user_id: user!.id,
        user_name: (!jobsiteId && !jobsiteGroup) ? 'Admin' : `${employee.first_name} ${employee.last_name}`,
        content: `Attached: ${file.name}`,
        created_at: new Date().toISOString(),
        jobsite_id: jobsiteId,
        jobsite_group: jobsiteGroup || (!jobsiteId ? 'GENERAL' : undefined),
        jobsite_group_name: jobsiteGroupName,
      };

      const { data: msg, error: msgError } = await supabase
        .from('chat_messages')
        .insert(messageData)
        .select()
        .single();

      if (msgError) throw msgError;

      await supabase.from('chat_attachments').insert({
        message_id: msg.id,
        file_url: filePath, // Store the path
        file_name: file.name,
        file_type: file.type
      });

    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleDownload = async (path: string) => {
    console.log('Attempting to download:', path);
    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .createSignedUrl(path, 3600); // URL valid for 1 hour

    if (error) {
      console.error('Error creating signed URL:', error);
      return;
    }

    console.log('Signed URL created:', data.signedUrl);
    window.open(data.signedUrl, '_blank');
  };

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
    if (!user || isSubscribedRef.current) return;

    // Request notification permission
    if ('Notification' in window && window.Notification.permission === 'default') {
      window.Notification.requestPermission();
    }

    // Load initial messages from DB
    const fetchMessages = async () => {
      let query = supabase
        .from('chat_messages')
        .select('*, chat_attachments(*)')
        .order('created_at', { ascending: true })
        .limit(100);
        
      if (jobsiteGroup) {
        const { data: jobsites } = await supabase
          .from('jobsites')
          .select('id')
          .eq('jobsite_group', jobsiteGroup);
        const jobsiteIds = jobsites?.map(js => js.id) || [];
        
        let filter = `jobsite_group.eq.${jobsiteGroup},jobsite_group.eq.GENERAL,jobsite_id.eq.BROADCAST`;
        if (jobsiteIds.length > 0) {
          filter += `,jobsite_id.in.(${jobsiteIds.join(',')})`;
        }
        query = query.or(filter);
      } else if (jobsiteId) {
        query = query.or(`jobsite_id.eq.${jobsiteId},jobsite_group.eq.GENERAL,jobsite_id.eq.BROADCAST`);
      } else {
        query = query.or('jobsite_id.is.null,jobsite_group.is.null,jobsite_id.eq.BROADCAST');
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
      const messagesChannel = supabase.channel(`${channelName}:messages`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
          },
          (payload) => {
            const msg = payload.new as Message;
            if (msg.user_name === 'System') return;

            // Client-side filtering logic
            const isBroadcast = msg.jobsite_id === 'BROADCAST';
            const isGeneral = !msg.jobsite_id && !msg.jobsite_group;
            
            let matches = false;
            if (isBroadcast) {
              matches = true;
            } else if (jobsiteGroup) {
              matches = msg.jobsite_group === jobsiteGroup || isGeneral;
            } else if (jobsiteId) {
              matches = msg.jobsite_id === jobsiteId || isGeneral;
            } else {
              matches = isGeneral;
            }

            if (!matches) return;
            
            const fetchAttachments = async () => {
              const { data: attachments } = await supabase
                .from('chat_attachments')
                .select('*')
                .eq('message_id', msg.id);
              
              const msgWithAdminName = {
                ...msg,
                user_name: (!jobsiteId && !jobsiteGroup) ? 'Admin' : msg.user_name,
                attachments: attachments || []
              };

              setMessages((prev) => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, msgWithAdminName];
              });
            };
            fetchAttachments();
            
            if (msg.user_id !== user.id && 'Notification' in window && window.Notification.permission === 'granted' && document.hidden) {
              new window.Notification(`New message from ${(!jobsiteId && !jobsiteGroup) ? 'Admin' : msg.user_name}`, {
                body: msg.content,
                icon: '/logo.png'
              });
            }
          }
        )
        .subscribe((status, err) => {
          console.log('Messages subscription status:', status, 'Error:', err);
          setIsSubscribed(status === 'SUBSCRIBED');
          if (status === 'SUBSCRIBED') {
            isSubscribedRef.current = true;
          }
        });

      const attachmentsChannel = supabase.channel(`${channelName}:attachments`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_attachments',
          },
          (payload) => {
            const attachment = payload.new as any;
            setMessages(prev => prev.map(msg => {
                if (msg.id === attachment.message_id) {
                    if (msg.attachments?.some((a: any) => a.id === attachment.id)) return msg;
                    return {
                        ...msg,
                        attachments: [...(msg.attachments || []), attachment]
                    };
                }
                return msg;
            }));
          }
        )
        .subscribe((status, err) => {
          console.log('Attachments subscription status:', status, 'Error:', err);
        });

      // Listen for typing events
      const typingChannel = supabase.channel(`${channelName}:typing`)
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload.userId === user.id) return;
          
          setTypingUsers(prev => ({ ...prev, [payload.userId]: payload.userName }));
          
          // Clear existing timeout for this user
          if (typingTimeoutRef.current[payload.userId]) {
            clearTimeout(typingTimeoutRef.current[payload.userId]);
          }
          
          // Set timeout to remove user from typing list
          typingTimeoutRef.current[payload.userId] = setTimeout(() => {
            setTypingUsers(prev => {
              const next = { ...prev };
              delete next[payload.userId];
              return next;
            });
          }, 3000);
        })
        .subscribe();

      return { messagesChannel, attachmentsChannel, typingChannel };
    };

    subscribeToMessages().then(c => { channelRef.current = c; });

    return () => {
      if (channelRef.current) {
        if (channelRef.current.messagesChannel) supabase.removeChannel(channelRef.current.messagesChannel);
        if (channelRef.current.attachmentsChannel) supabase.removeChannel(channelRef.current.attachmentsChannel);
        if (channelRef.current.typingChannel) supabase.removeChannel(channelRef.current.typingChannel);
        isSubscribedRef.current = false;
      }
      // Cleanup timeouts
      Object.values(typingTimeoutRef.current).forEach(clearTimeout);
    };
  }, [user, jobsiteId, jobsiteGroup, channelName]);

  const handleTyping = () => {
    if (!channelRef.current || !employee || !isSubscribed) return;
    
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user?.id, userName: `${employee.first_name} ${employee.last_name}` }
    });
  };

  // Debounce typing event
  const debouncedTyping = useRef<NodeJS.Timeout>();
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    if (debouncedTyping.current) clearTimeout(debouncedTyping.current);
    debouncedTyping.current = setTimeout(handleTyping, 500);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !employee) return;

    const content = newMessage.trim();
    const messageData = {
      user_id: user.id,
      user_name: (!jobsiteId && !jobsiteGroup) ? 'Admin' : `${employee.first_name} ${employee.last_name}`,
      content: content,
      created_at: new Date().toISOString(),
    };

    if (isBroadcast) {
      // Broadcast to all jobsites - insert ONE message
      const messageData = {
        user_id: user.id,
        user_name: 'Admin',
        content: content,
        created_at: new Date().toISOString(),
        jobsite_id: 'BROADCAST',
        jobsite_group: null,
      };

      // Optimistic update
      const message: Message = {
        id: crypto.randomUUID(),
        ...messageData,
      };
      setMessages((prev) => [...prev, message]);
      setNewMessage('');

      // Insert into DB
      const { error } = await supabase.from('chat_messages').insert(message);
      if (error) console.error('Error broadcasting message:', error);
    } else {
      // Normal message
      const message: Message = {
        id: crypto.randomUUID(),
        ...messageData,
        jobsite_id: jobsiteId,
        jobsite_group: jobsiteGroup || (!jobsiteId ? 'GENERAL' : undefined),
        jobsite_group_name: jobsiteGroupName,
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
        jobsite_group_name: message.jobsite_group_name || null,
        created_at: message.created_at,
      });

      if (error) {
        console.error('Error sending message:', error);
      }
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
            const isBroadcast = msg.jobsite_id === 'BROADCAST';
            return (
              <div
                key={msg.id}
                ref={highlightKeyword && msg.content.toLowerCase().includes(highlightKeyword.toLowerCase()) ? highlightedMessageRef : null}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-xs font-bold ${isAdmin ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {isMe ? 'You' : msg.user_name} {isBroadcast ? <span className="text-[10px] bg-emerald-500 text-black px-1 rounded ml-1">BROADCAST</span> : isAdmin && <span className="text-[10px] bg-emerald-900/50 px-1 rounded ml-1">ADMIN</span>}
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
                      : isBroadcast
                      ? 'bg-gradient-to-r from-emerald-900/40 to-emerald-800/40 text-white border-2 border-emerald-500 rounded-tl-sm shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                      : isAdmin
                      ? 'bg-emerald-900/20 text-emerald-100 border border-emerald-500/30 rounded-tl-sm'
                      : 'bg-white/5 text-white border border-white/10 rounded-tl-sm'
                  } ${highlightKeyword && msg.content.toLowerCase().includes(highlightKeyword.toLowerCase()) ? 'ring-2 ring-yellow-500' : ''}`}
                >
                  {isBroadcast && <Megaphone size={16} className="text-emerald-400 mb-1" />}
                  <p className="text-sm">{msg.content}</p>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.attachments.map((att: any) => (
                        <button
                          key={att.id}
                          onClick={() => handleDownload(att.file_url)}
                          className="flex items-center gap-2 text-xs bg-black/20 p-2 rounded hover:bg-black/40 transition-colors w-full text-left"
                        >
                          {att.file_type.startsWith('image/') ? <ImageIcon size={14} /> : <FileText size={14} />}
                          <span className="truncate">{att.file_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {Object.keys(typingUsers).length > 0 && (
        <div className="px-4 py-1 text-xs text-emerald-500 italic">
          {Object.values(typingUsers).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      <form onSubmit={handleSendMessage} className="p-4 bg-[#050A08] border-t border-emerald-900/30">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-colors"
          >
            <Paperclip size={20} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
          />
          <input
            type="text"
            value={newMessage}
            onChange={onInputChange}
            placeholder="Type a message..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <button
            type="submit"
            disabled={(!newMessage.trim() && !isUploading) || isUploading}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black p-3 rounded-xl transition-colors flex items-center justify-center"
          >
            {isUploading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div> : <Send size={20} />}
          </button>
        </div>
      </form>
    </div>
  );
}
