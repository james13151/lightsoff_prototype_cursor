import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { relativeTime } from '@/lib/helpers';
import { X, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { canAccessTickets } from '@/lib/permissions';

export default function NotificationPanel({ open, onClose, notifications, currentUserId, currentUser, onSelectTicket }) {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications', currentUserId] });

  const markRead = async (notif) => {
    if (!notif.is_read) {
      await base44.entities.Notification.update(notif.id, { is_read: true });
      invalidate();
    }
    // Only navigate to ticket if user has ticket access
    if (notif.ticket_id && canAccessTickets(currentUser)) {
      onSelectTicket(notif.ticket_id);
    }
    onClose();
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    for (const n of unread) {
      await base44.entities.Notification.update(n.id, { is_read: true });
    }
    invalidate();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/10 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[360px] bg-background border-l border-thin border-border z-50 flex flex-col"
          >
            <div className="px-5 py-4 border-b border-thin border-border flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">通知</h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-[11px] px-2">
                  <CheckCheck className="w-3.5 h-3.5 mr-1" />
                  全部标记已读
                </Button>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-accent transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[13px] text-muted-foreground">暂无通知</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => markRead(notif)}
                    className={cn(
                      'w-full text-left px-5 py-3.5 border-b border-thin border-border hover:bg-accent/30 transition-colors',
                      !notif.is_read && 'bg-primary/3'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {!notif.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          'text-[13px] leading-relaxed',
                          notif.is_read ? 'text-muted-foreground' : 'text-foreground'
                        )}>
                          {notif.message}
                        </p>
                        <span className="text-[11px] text-muted-foreground/60 mt-1 block">
                          {relativeTime(notif.created_date)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}