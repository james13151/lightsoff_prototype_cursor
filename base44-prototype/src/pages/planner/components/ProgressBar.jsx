export default function ProgressBar({ pct, height = 4 }) {
  const color = pct >= 100 ? '#81C784' : pct >= 50 ? '#4FC3F7' : '#FFB74D';
  return (
    <div className="w-full rounded-full overflow-hidden bg-muted" style={{ height }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}