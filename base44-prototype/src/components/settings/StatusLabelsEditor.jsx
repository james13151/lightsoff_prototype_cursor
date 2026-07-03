import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';

const PRESET_COLORS = [
  '#9E9E9E', // gray
  '#4FC3F7', // blue
  '#81C784', // green
  '#FFB74D', // amber
  '#E57373', // red
  '#BA68C8', // purple
  '#4DB6AC', // teal
  '#F06292', // pink
  '#D4AF37', // gold
  '#7986CB', // indigo
];

function ColorDot({ color, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-5 h-5 rounded-full flex-shrink-0 transition-all ${selected ? 'ring-2 ring-offset-1 ring-offset-background ring-white scale-110' : 'hover:scale-110'}`}
      style={{ background: color }}
    />
  );
}

function StatusRow({ item, canDelete, onSave, onDelete, showColor, showBilingual }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ ...item });
  const [showColorPicker, setShowColorPicker] = useState(false);

  const commit = () => {
    onSave(draft);
    setEditing(false);
    setShowColorPicker(false);
  };
  const cancel = () => {
    setDraft({ ...item });
    setEditing(false);
    setShowColorPicker(false);
  };

  return (
    <div className="flex flex-col gap-1.5 py-2.5 px-3 rounded-lg border border-thin border-border hover:border-border/60 transition-colors">
      <div className="flex items-center gap-2">
        {/* Color dot */}
        {showColor && (
          <div className="relative">
            <button
              onClick={() => editing && setShowColorPicker(p => !p)}
              className="w-4 h-4 rounded-full flex-shrink-0 transition-all"
              style={{ background: draft.color || '#9E9E9E' }}
            />
            {showColorPicker && editing && (
              <div className="absolute left-0 top-6 z-50 flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-popover shadow-xl w-[132px]">
                {PRESET_COLORS.map(c => (
                  <ColorDot key={c} color={c} selected={draft.color === c}
                    onClick={() => { setDraft(d => ({ ...d, color: c })); setShowColorPicker(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {editing ? (
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <Input
              value={draft.label_zh}
              onChange={e => setDraft(d => ({ ...d, label_zh: e.target.value }))}
              placeholder="中文标签"
              className="h-7 text-[12px] border-thin flex-1 min-w-[80px]"
              autoFocus
            />
            {showBilingual && (
              <Input
                value={draft.label_en || ''}
                onChange={e => setDraft(d => ({ ...d, label_en: e.target.value }))}
                placeholder="English label"
                className="h-7 text-[12px] border-thin flex-1 min-w-[80px]"
              />
            )}
            <div className="flex gap-1">
              <button onClick={commit} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={cancel} className="text-muted-foreground hover:text-foreground p-0.5"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[13px] text-foreground flex-1">{item.label_zh}</span>
            {showBilingual && item.label_en && (
              <span className="text-[11px] text-muted-foreground">{item.label_en}</span>
            )}
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-1">
            <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground p-0.5 transition-colors">
              <Pencil className="w-3 h-3" />
            </button>
            {canDelete && (
              <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-0.5 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StatusLabelsEditor({
  title,
  description,
  items,
  onChange,
  showColor = false,
  showBilingual = true,
  canAdd = true,
  lockedValues = [],   // values that cannot be deleted
  usedValues = [],     // values currently in use (also cannot be deleted)
}) {
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ label_zh: '', label_en: '', color: '#9E9E9E' });

  const handleSave = (idx, updated) => {
    const next = items.map((item, i) => i === idx ? { ...item, ...updated } : item);
    onChange(next);
  };

  const handleDelete = (idx) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    if (!newItem.label_zh.trim()) return;
    const value = newItem.label_zh.trim();
    onChange([...items, { value, label_zh: value, label_en: newItem.label_en, color: newItem.color || '#9E9E9E' }]);
    setNewItem({ label_zh: '', label_en: '', color: '#9E9E9E' });
    setAdding(false);
  };

  return (
    <div className="mb-8">
      <div className="mb-3">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="space-y-1.5">
        {items.map((item, idx) => {
          const isLocked = lockedValues.includes(item.value);
          const isUsed = usedValues.includes(item.value);
          const canDelete = !isLocked && !isUsed;
          return (
            <StatusRow
              key={item.value + idx}
              item={item}
              canDelete={canDelete}
              showColor={showColor}
              showBilingual={showBilingual}
              onSave={updated => handleSave(idx, updated)}
              onDelete={() => handleDelete(idx)}
            />
          );
        })}

        {adding && (
          <div className="flex items-center gap-2 py-2 px-3 rounded-lg border border-primary/30 bg-primary/5 flex-wrap">
            {showColor && (
              <div className="flex gap-1 flex-wrap w-full mb-1">
                {PRESET_COLORS.map(c => (
                  <ColorDot key={c} color={c} selected={newItem.color === c}
                    onClick={() => setNewItem(d => ({ ...d, color: c }))}
                  />
                ))}
              </div>
            )}
            <Input
              value={newItem.label_zh}
              onChange={e => setNewItem(d => ({ ...d, label_zh: e.target.value }))}
              placeholder="中文标签"
              className="h-7 text-[12px] border-thin flex-1 min-w-[80px]"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            {showBilingual && (
              <Input
                value={newItem.label_en}
                onChange={e => setNewItem(d => ({ ...d, label_en: e.target.value }))}
                placeholder="English label"
                className="h-7 text-[12px] border-thin flex-1 min-w-[80px]"
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            )}
            <div className="flex gap-1">
              <button onClick={handleAdd} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground p-0.5"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}

        {canAdd && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center gap-1.5 py-2 px-3 rounded-lg border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 新增状态
          </button>
        )}
      </div>
    </div>
  );
}