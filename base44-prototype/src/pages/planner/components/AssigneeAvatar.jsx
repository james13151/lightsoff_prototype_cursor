import { getInitials } from '@/lib/helpers';

export default function AssigneeAvatar({ user, size = 'sm' }) {
  if (!user) return null;
  const s = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]';
  return (
    <div className={`${s} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`} style={{ background: '#4A5B7A' }} title={user.full_name}>
      {getInitials(user.full_name)}
    </div>
  );
}