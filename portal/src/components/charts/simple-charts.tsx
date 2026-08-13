export function BarChart({
  items,
  valueKey = "value",
  labelKey = "label",
}: {
  items: Array<Record<string, string | number>>;
  valueKey?: string;
  labelKey?: string;
}) {
  const max = Math.max(1, ...items.map((item) => Number(item[valueKey] ?? 0)));
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const value = Number(item[valueKey] ?? 0);
        const width = `${Math.max(4, (value / max) * 100)}%`;
        return (
          <div key={`${item[labelKey]}-${index}`}>
            <div className="mb-1 flex justify-between text-xs">
              <span>{String(item[labelKey])}</span>
              <span className="font-medium">{value}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StackedAttendanceChart({
  items,
}: {
  items: Array<{ date: string; present: number; absent: number; late: number }>;
}) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No attendance marked yet.</p>;
  }
  return (
    <div className="flex h-40 items-end gap-1">
      {items.slice(-14).map((item) => {
        const total = Math.max(1, item.present + item.absent + item.late);
        return (
          <div key={item.date} className="flex h-full flex-1 flex-col justify-end" title={item.date}>
            <div className="flex h-full flex-col justify-end overflow-hidden rounded-sm">
              <div className="bg-emerald-500" style={{ height: `${(item.present / total) * 100}%` }} />
              <div className="bg-amber-400" style={{ height: `${(item.late / total) * 100}%` }} />
              <div className="bg-rose-400" style={{ height: `${(item.absent / total) * 100}%` }} />
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.date.slice(5)}</p>
          </div>
        );
      })}
    </div>
  );
}
