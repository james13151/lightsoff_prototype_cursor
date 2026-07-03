/**
 * Centralized toast helpers — wraps sonner's `toast` with
 * app-specific styles (gold left-border for success, red for error).
 */
import { toast as sonnerToast } from 'sonner';

const SUCCESS_STYLE = {
  style: {
    borderLeft: '3px solid #D4AF37',
    background: '#1e2330',
    color: '#fff',
    borderRadius: '999px',
    padding: '10px 18px',
    fontSize: '13px',
  },
};

const ERROR_STYLE = {
  style: {
    borderLeft: '3px solid #ef4444',
    background: '#1e2330',
    color: '#fff',
    borderRadius: '999px',
    padding: '10px 18px',
    fontSize: '13px',
  },
};

export const toastSuccess = (msg) => sonnerToast.success(msg, { duration: 2500, ...SUCCESS_STYLE });
export const toastError   = (msg) => sonnerToast.error(msg,   { duration: 3500, ...ERROR_STYLE });