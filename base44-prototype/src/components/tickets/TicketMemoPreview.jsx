import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ArrowRight } from 'lucide-react';
import moment from 'moment';

export default function TicketMemoPreview({ currentUser, onOpenMemos }) {
  const { data: memos = [] } = useQuery({
    queryKey: ['memos', currentUser?.id],
    queryFn: () =>
      currentUser ? base44.entities.Memo.filter({ owner_id: currentUser.id }, '-updated_date', 2) : [],
    enabled: !!currentUser,
  });

  return (
    <div className="px-6 py-4 border-t border-white/[0.08]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
          <h3 className="text-[13px] font-semibold text-white/80">我的备忘录</h3>
        </div>
        <button
          onClick={onOpenMemos}
          className="flex items-center gap-1 text-[11px] transition-colors hover:text-white/80 text-white/40"
        >
          查看全部
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {memos.length === 0 ? (
        <p className="text-[12px] text-white/30 italic">暂无备忘录</p>
      ) : (
        <div className="space-y-2">
          {memos.slice(0, 2).map(memo => (
            <button
              key={memo.id}
              onClick={onOpenMemos}
              className="w-full text-left rounded-lg px-3 py-2.5 border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
            >
              <p className="text-[12px] font-medium text-white/80 truncate">{memo.title || '无标题'}</p>
              <p className="text-[11px] text-white/40 mt-0.5 line-clamp-2 leading-relaxed">
                {memo.content || '暂无内容'}
              </p>
              <p className="text-[10px] text-white/25 mt-1">{moment(memo.updated_date || memo.created_date).format('MM-DD HH:mm')}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}