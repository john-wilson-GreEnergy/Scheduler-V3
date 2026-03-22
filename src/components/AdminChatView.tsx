import { useState, useEffect } from 'react';
import Chat from './Chat';
import { Jobsite, JobsiteGroup } from '../types';
import { MessageSquare, ChevronLeft, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AdminChatView({ jobsites, jobsiteGroups }: { jobsites: Jobsite[], jobsiteGroups: JobsiteGroup[] }) {
  const [selectedChat, setSelectedChat] = useState<{ id?: string, group?: string, groupName?: string, name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [highlightKeyword, setHighlightKeyword] = useState<string>('');

  const activeJobsites = jobsites.filter(j => j.is_active);
  const inactiveJobsites = jobsites.filter(j => !j.is_active);
  const groups = jobsiteGroups;
  const ungroupedActiveSites = activeJobsites.filter(j => !j.group_id);
  const ungroupedInactiveSites = inactiveJobsites.filter(j => !j.group_id);

  useEffect(() => {
    if (searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const searchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('id, content, user_name, created_at, jobsite_id, jobsite_group, jobsite_group_name')
        .ilike('content', `%${searchQuery}%`)
        .limit(20);
      
      setSearchResults(data || []);
    };
    searchMessages();
  }, [searchQuery]);

  if (!selectedChat) {
    return (
      <div className="p-6 space-y-8">
        <div className="relative max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
          <input 
            type="text" 
            placeholder="Search chats or messages..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-all" 
          />
        </div>

        {searchQuery.length >= 3 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase">Message Results</h3>
            {searchResults.map(msg => (
              <button key={msg.id} onClick={() => {
                setHighlightKeyword(searchQuery);
                let chatName = 'Chat';
                if (msg.jobsite_group) chatName = `${msg.jobsite_group_name || msg.jobsite_group} (Group)`;
                else if (msg.jobsite_id) {
                    const site = jobsites.find(j => j.id === msg.jobsite_id);
                    chatName = site ? site.jobsite_name : 'Jobsite Chat';
                }
                setSelectedChat({ id: msg.jobsite_id, group: msg.jobsite_group, groupName: msg.jobsite_group_name, name: chatName });
              }} className="w-full p-3 bg-white/5 rounded-lg text-left hover:bg-white/10">
                <p className="text-sm text-white font-bold">{msg.content}</p>
                <p className="text-xs text-gray-500">{msg.user_name} · {new Date(msg.created_at).toLocaleDateString()}</p>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-6">
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">General</h3>
            <div className="space-y-2">
              <button onClick={() => setSelectedChat({ name: 'Broadcast to All Jobsites', id: 'BROADCAST' })} className="flex items-center gap-3 w-full p-3 bg-emerald-900/20 rounded-lg hover:bg-emerald-900/40 text-emerald-100 transition-all border border-emerald-500/30">
                <MessageSquare className="text-emerald-500" size={18} />
                <span className="font-medium">Broadcast to All Jobsites</span>
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Groups</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {groups.map(group => (
                <button key={group.id} onClick={() => setSelectedChat({ group: group.name, groupName: group.name, name: group.name })} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 text-white transition-all">
                  <MessageSquare className="text-emerald-500" size={18} />
                  <span className="font-medium">{group.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Active Jobsites</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ungroupedActiveSites.map(site => (
                <button key={site.id} onClick={() => setSelectedChat({ id: site.id, name: site.jobsite_name })} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 text-white transition-all">
                  <MessageSquare className="text-emerald-500" size={18} />
                  <span className="font-medium">{site.jobsite_name}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">Inactive Jobsites</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ungroupedInactiveSites.map(site => (
                <button key={site.id} onClick={() => setSelectedChat({ id: site.id, name: site.jobsite_name })} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 text-white transition-all opacity-70">
                  <MessageSquare className="text-gray-500" size={18} />
                  <span className="font-medium">{site.jobsite_name}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <button onClick={() => { setSelectedChat(null); setHighlightKeyword(''); }} className="mb-4 flex items-center gap-2 text-emerald-500 hover:text-emerald-400">
        <ChevronLeft size={16} /> Back to Chat Menu
      </button>
      <div className="flex-1">
        <Chat jobsiteId={selectedChat.id} jobsiteGroup={selectedChat.group} jobsiteGroupName={selectedChat.groupName} jobsiteName={selectedChat.name} highlightKeyword={highlightKeyword} allJobsites={jobsites} />
      </div>
    </div>
  );
}
