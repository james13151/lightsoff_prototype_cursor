import moment from 'moment';

export function formatTicketId(id) {
  if (!id) return '';
  const str = String(id).replace(/-/g, '');
  return `#TK-${str.slice(0, 6).toUpperCase()}`;
}

/**
 * Format a UTC timestamp for display in the user's local timezone.
 * Same day  → 今天 14:32 / Today 14:32
 * Yesterday → 昨天 09:15 / Yesterday 09:15
 * This year → 6月4日 14:32 / Jun 4, 14:32
 * Older     → 2025年3月12日 / Mar 12, 2025
 */
export function formatLocalTime(dateStr, locale = 'zh') {
  if (!dateStr) return '';
  const m = moment(dateStr); // moment auto-converts UTC ISO strings to local time
  const now = moment();
  const timeStr = m.format('HH:mm');

  if (m.isSame(now, 'day')) {
    return locale === 'zh' ? `今天 ${timeStr}` : `Today ${timeStr}`;
  }
  const yesterday = moment().subtract(1, 'day');
  if (m.isSame(yesterday, 'day')) {
    return locale === 'zh' ? `昨天 ${timeStr}` : `Yesterday ${timeStr}`;
  }
  if (m.isSame(now, 'year')) {
    return locale === 'zh'
      ? `${m.month() + 1}月${m.date()}日 ${timeStr}`
      : m.format('MMM D, HH:mm');
  }
  return locale === 'zh'
    ? `${m.year()}年${m.month() + 1}月${m.date()}日`
    : m.format('MMM D, YYYY');
}

export function relativeTime(dateStr, locale = 'zh') {
  if (!dateStr) return '';
  const m = moment(dateStr);
  const now = moment();
  const diffMin = now.diff(m, 'minutes');
  if (diffMin < 1) return locale === 'zh' ? '刚刚' : 'just now';
  if (diffMin < 60) return locale === 'zh' ? `${diffMin}分钟前` : `${diffMin}m ago`;
  const diffHr = now.diff(m, 'hours');
  if (diffHr < 24) return locale === 'zh' ? `${diffHr}小时前` : `${diffHr}h ago`;
  // For older entries, use formatted local time
  return formatLocalTime(dateStr, locale);
}

// Basic Chinese character to pinyin first-letter mapping (covers common surnames + given name initials)
const PINYIN_MAP = {
  '陈':'C','张':'Z','李':'L','王':'W','刘':'L','杨':'Y','黄':'H','赵':'Z','吴':'W','周':'Z',
  '徐':'X','孙':'S','朱':'Z','马':'M','胡':'H','郭':'G','林':'L','何':'H','高':'G','梁':'L',
  '郑':'Z','罗':'L','宋':'S','谢':'X','唐':'T','韩':'H','曹':'C','许':'X','邓':'D','萧':'X',
  '冯':'F','曾':'Z','程':'C','蔡':'C','彭':'P','潘':'P','袁':'Y','于':'Y','董':'D','余':'Y',
  '苏':'S','叶':'Y','吕':'L','魏':'W','蒋':'J','田':'T','杜':'D','丁':'D','沈':'S','姜':'J',
  '范':'F','江':'J','傅':'F','钟':'Z','卢':'L','汪':'W','戴':'D','崔':'C','任':'R','陆':'L',
  '廖':'L','姚':'Y','方':'F','金':'J','邱':'Q','夏':'X','谭':'T','韦':'W','贾':'J','邹':'Z',
  '石':'S','熊':'X','孟':'M','秦':'Q','阎':'Y','薛':'X','侯':'H','雷':'L','白':'B','龙':'L',
  '段':'D','郝':'H','孔':'K','邵':'S','史':'S','毛':'M','常':'C','万':'W','顾':'G','赖':'L',
  '武':'W','康':'K','贺':'H','严':'Y','尹':'Y','钱':'Q','施':'S','牛':'N','洪':'H','龚':'G',
  '小':'X','大':'D','明':'M','国':'G','华':'H','建':'J','志':'Z','文':'W','强':'Q','伟':'W',
  '军':'J','海':'H','波':'B','超':'C','涛':'T','磊':'L','鑫':'X','宇':'Y','浩':'H','峰':'F',
  '飞':'F','俊':'J','晨':'C','云':'Y','凯':'K','欣':'X','雪':'X','琳':'L','慧':'H','婷':'T',
};

function isChinese(str) {
  return /[\u4e00-\u9fff]/.test(str);
}

function chineseToInitial(char) {
  return PINYIN_MAP[char] || char.slice(0, 1).toUpperCase();
}

export function getInitials(name) {
  if (!name) return '?';
  const trimmed = name.trim();

  // Chinese name: no spaces, all/mostly Chinese characters
  if (isChinese(trimmed) && !/\s/.test(trimmed)) {
    if (trimmed.length === 1) return trimmed[0].toUpperCase();
    if (trimmed.length === 2) {
      // Family + given: first letter of each
      return (chineseToInitial(trimmed[0]) + chineseToInitial(trimmed[1])).toUpperCase();
    }
    // 3+ chars: first char = family name, second char = first of given name
    return (chineseToInitial(trimmed[0]) + chineseToInitial(trimmed[1])).toUpperCase();
  }

  // Mixed or space-separated (e.g. "Chen Xiaohui")
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    // Single word — check if Chinese
    if (isChinese(parts[0])) {
      return (chineseToInitial(parts[0][0]) + chineseToInitial(parts[0][1] || parts[0][0])).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  // First letter of first + first letter of last word
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isOverdue(dueDateStr) {
  if (!dueDateStr) return false;
  return moment(dueDateStr).isBefore(moment(), 'day');
}

export function isDueToday(dueDateStr) {
  if (!dueDateStr) return false;
  return moment(dueDateStr).isSame(moment(), 'day');
}

export const STATUS_COLORS = {
  '待处理': 'bg-amber-50 text-amber-700 border-amber-200',
  '处理中': 'bg-blue-50 text-blue-700 border-blue-200',
  '待客户回复': 'bg-pink-50 text-pink-700 border-pink-200',
  '已解决': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const STATUS_DOT_COLORS = {
  '待处理': 'bg-amber-400',
  '处理中': 'bg-blue-400',
  '待客户回复': 'bg-pink-400',
  '已解决': 'bg-emerald-400',
};