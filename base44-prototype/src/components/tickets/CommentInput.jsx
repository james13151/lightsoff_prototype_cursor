import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastSuccess, toastError } from '@/lib/toast';

export default function CommentInput({ onSend, users }) {
  const [text, setText] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    const lastAt = val.lastIndexOf('@');
    if (lastAt !== -1 && (lastAt === 0 || val[lastAt - 1] === ' ')) {
      const query = val.slice(lastAt + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (user) => {
    const lastAt = text.lastIndexOf('@');
    const before = text.slice(0, lastAt);
    setText(`${before}@${user.full_name} `);
    setShowMentions(false);
  };

  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
      toastSuccess('备注已添加');
    } catch {
      toastError('操作失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredUsers = users?.filter(u =>
    u.full_name?.toLowerCase().includes(mentionQuery.toLowerCase())
  ) || [];

  return (
    <div className="relative border-t border-thin border-border px-4 py-3 bg-background">
      {showMentions && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-4 mb-1 bg-popover border border-thin border-border rounded-lg shadow-sm py-1 min-w-[160px] z-10">
          {filteredUsers.map(u => (
            <button
              key={u.id}
              onClick={() => insertMention(u)}
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors"
            >
              {u.full_name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="添加跟进备注… 支持 @同事名 提醒对方"
          rows={1}
          className="flex-1 resize-none text-[13px] bg-muted/50 border border-thin border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="h-8 w-8 p-0 rounded-lg border-0 disabled:opacity-30"
          style={{ background: '#D4AF37', color: '#1a1e28' }}
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}