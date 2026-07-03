import React from 'react';
import { getInitials } from '@/lib/helpers';

export default function UserAvatar({ user, size = 24 }) {
  if (!user) return <span style={{ width: size, height: size, display: 'inline-block' }} />;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold flex-shrink-0"
      style={{
        width: size, height: size,
        background: '#4A5B7A',
        color: '#fff',
        fontSize: size * 0.4,
      }}
      title={user.full_name}
    >
      {getInitials(user.full_name)}
    </span>
  );
}