import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import moment from 'moment';

// ─── Memo List ────────────────────────────────────────────────────────────────
function MemoList({ memos, selectedId, onSelect, onCreate }) {
  return (
    <div className="w-[300px] min-w-[300px] h-screen flex flex-col" style={{ background: '#FFFFFF', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
      <div className="px-4 pt-5 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <h2 className="text-[15px] font-semibold" style={{ color: '#1A1E28' }}>我的备忘录</h2>
        <Button
          size="sm"
          onClick={onCreate}
          className="h-7 text-[12px] px-2.5 rounded-md bg-[#C49A1A] hover:bg-[#b08916] text-white font-semibold border-0"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          新建
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3 pt-2 space-y-1.5">
        {memos.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(26,30,40,0.2)' }} />
            <p className="text-[13px]" style={{ color: 'rgba(26,30,40,0.4)' }}>暂无备忘录</p>
            <p className="text-[11px] mt-1" style={{ color: 'rgba(26,30,40,0.25)' }}>点击右上角新建</p>
          </div>
        ) : (
          memos.map(memo => (
            <button
              key={memo.id}
              onClick={() => onSelect(memo.id)}
              className={cn('w-full text-left rounded-lg px-3 py-3 transition-all')}
              style={selectedId === memo.id
                ? { background: 'rgba(196,154,26,0.08)', border: '1px solid rgba(196,154,26,0.35)' }
                : { background: 'transparent', border: '1px solid rgba(0,0,0,0.06)' }
              }
            >
              <p className="text-[13px] font-medium truncate" style={{ color: '#1A1E28' }}>{memo.title || '无标题'}</p>
              <p className="text-[11px] mt-1 line-clamp-2 leading-relaxed" style={{ color: 'rgba(26,30,40,0.55)' }}>
                {memo.content || '暂无内容'}
              </p>
              <p className="text-[10px] mt-1.5" style={{ color: 'rgba(26,30,40,0.35)' }}>{moment(memo.updated_date || memo.created_date).format('MM-DD HH:mm')}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Memo Editor ──────────────────────────────────────────────────────────────
function MemoEditor({ memo, onDelete, onUpdate }) {
  const [title, setTitle] = useState(memo?.title || '');
  const [content, setContent] = useState(memo?.content || '');
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    setTitle(memo?.title || '');
    setContent(memo?.content || '');
  }, [memo?.id]);

  const triggerSave = useCallback((newTitle, newContent) => {
    if (!memo) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await base44.entities.Memo.update(memo.id, { title: newTitle, content: newContent });
      onUpdate();
      setSaving(false);
    }, 800);
  }, [memo?.id, onUpdate]);

  if (!memo) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#F4F5F7' }}>
        <div className="text-center">
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(26,30,40,0.2)' }} />
          <p className="text-[14px]" style={{ color: 'rgba(26,30,40,0.4)' }}>选择一条备忘录开始编辑</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen" style={{ background: '#F4F5F7' }}>
      {/* Header */}
      <div className="px-6 pt-4 pb-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <span className="text-[11px]" style={{ color: 'rgba(26,30,40,0.35)' }}>{saving ? '保存中...' : '已自动保存'}</span>
        <button
          onClick={() => onDelete(memo.id)}
          className="flex items-center gap-1 text-[11px] transition-colors px-2 py-1 rounded-md hover:bg-red-50"
          style={{ color: 'rgba(220,38,38,0.7)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          删除备忘录
        </button>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col px-8 py-6 overflow-y-auto custom-scrollbar">
        <input
          className="w-full bg-transparent text-[22px] font-semibold border-none outline-none mb-4 leading-tight"
          style={{ color: '#1A1E28' }}
          placeholder="备忘录标题"
          value={title}
          onChange={e => {
            setTitle(e.target.value);
            triggerSave(e.target.value, content);
          }}
        />
        <textarea
          className="flex-1 w-full bg-transparent text-[14px] border-none outline-none resize-none leading-relaxed"
          style={{ color: 'rgba(26,30,40,0.75)' }}
          placeholder="开始输入内容..."
          value={content}
          rows={20}
          onChange={e => {
            setContent(e.target.value);
            triggerSave(title, e.target.value);
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Memo Page ────────────────────────────────────────────────────────────
export default function MemoPage({ currentUser }) {
  const [selectedMemoId, setSelectedMemoId] = useState(null);
  const queryClient = useQueryClient();

  const { data: memos = [] } = useQuery({
    queryKey: ['memos', currentUser?.id],
    queryFn: () =>
      currentUser
        ? base44.entities.Memo.filter({ owner_id: currentUser.id }, '-updated_date', 200)
        : [],
    enabled: !!currentUser,
  });

  const selectedMemo = memos.find(m => m.id === selectedMemoId) || null;

  const handleCreate = async () => {
    const created = await base44.entities.Memo.create({
      title: '',
      content: '',
      owner_id: currentUser.id,
    });
    queryClient.invalidateQueries({ queryKey: ['memos', currentUser?.id] });
    setSelectedMemoId(created.id);
  };

  const handleDelete = async (id) => {
    await base44.entities.Memo.delete(id);
    setSelectedMemoId(null);
    queryClient.invalidateQueries({ queryKey: ['memos', currentUser?.id] });
  };

  const handleUpdate = () => {
    queryClient.invalidateQueries({ queryKey: ['memos', currentUser?.id] });
  };

  return (
    <div className="flex flex-1 h-screen overflow-hidden">
      <MemoList
        memos={memos}
        selectedId={selectedMemoId}
        onSelect={setSelectedMemoId}
        onCreate={handleCreate}
      />
      <MemoEditor
        memo={selectedMemo}
        onDelete={handleDelete}
        onUpdate={handleUpdate}
      />
    </div>
  );
}