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

export function GroupedBarChart({
  items,
  series,
}: {
  items: Array<Record<string, string | number>>;
  series: Array<{ key: string; label: string; color: string }>;
}) {
  const max = Math.max(
    1,
    ...items.flatMap((item) => series.map((s) => Number(item[s.key] ?? 0))),
  );
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No money recorded yet.</p>;
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex h-44 items-end gap-2">
        {items.map((item) => (
          <div key={String(item.label)} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className="flex h-36 w-full items-end justify-center gap-0.5">
              {series.map((s) => {
                const value = Number(item[s.key] ?? 0);
                return (
                  <div
                    key={s.key}
                    className="w-full max-w-4 rounded-t-sm"
                    style={{ height: `${Math.max(value ? 6 : 2, (value / max) * 100)}%`, background: s.color }}
                    title={`${s.label}: ${value}`}
                  />
                );
              })}
            </div>
            <p className="truncate text-[10px] text-muted-foreground">{String(item.label)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CombinedFinanceChart({
  items,
  categories,
  colors,
}: {
  items: Array<{ label: string; collected: number; expenses: Record<string, number> }>;
  categories: string[];
  colors: Record<string, string>;
}) {
  const max = Math.max(
    1,
    ...items.map((item) =>
      Math.max(
        item.collected,
        categories.reduce((sum, cat) => sum + (item.expenses[cat] ?? 0), 0),
      ),
    ),
  );
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No money recorded yet.</p>;
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-teal-600" />
          Fees in
        </span>
        {categories.map((cat) => (
          <span key={cat} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: colors[cat] ?? "#94a3b8" }} />
            {cat.replaceAll("_", " ").toLowerCase()}
          </span>
        ))}
      </div>
      <div className="flex h-44 items-end gap-3">
        {items.map((item) => {
          const expenseTotal = categories.reduce((sum, cat) => sum + (item.expenses[cat] ?? 0), 0);
          return (
            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex h-36 w-full items-end justify-center gap-1">
                <div
                  className="w-1/2 max-w-6 rounded-t-sm bg-teal-600"
                  style={{ height: `${Math.max(item.collected ? 6 : 2, (item.collected / max) * 100)}%` }}
                  title={`Fees: ${item.collected}`}
                />
                <div
                  className="flex w-1/2 max-w-6 flex-col justify-end overflow-hidden rounded-t-sm"
                  style={{ height: `${Math.max(expenseTotal ? 6 : 2, (expenseTotal / max) * 100)}%` }}
                  title={`Expenses: ${expenseTotal}`}
                >
                  {categories.map((cat) => {
                    const value = item.expenses[cat] ?? 0;
                    if (!value || !expenseTotal) return null;
                    return (
                      <div
                        key={cat}
                        style={{ height: `${(value / expenseTotal) * 100}%`, background: colors[cat] ?? "#94a3b8" }}
                      />
                    );
                  })}
                </div>
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StackedExpenseChart({
  items,
  categories,
  colors,
}: {
  items: Array<{ label: string; expenses: Record<string, number> }>;
  categories: string[];
  colors: Record<string, string>;
}) {
  if (!items.length || !categories.length) {
    return <p className="text-sm text-muted-foreground">Add salaries or bills to see this chart.</p>;
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        {categories.map((cat) => (
          <span key={cat} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: colors[cat] ?? "#94a3b8" }} />
            {cat.replaceAll("_", " ").toLowerCase()}
          </span>
        ))}
      </div>
      <div className="flex h-40 items-end gap-2">
        {items.map((item) => {
          const total = Math.max(1, categories.reduce((sum, cat) => sum + (item.expenses[cat] ?? 0), 0));
          return (
            <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div className="flex h-32 w-full flex-col justify-end overflow-hidden rounded-sm">
                {categories.map((cat) => {
                  const value = item.expenses[cat] ?? 0;
                  if (!value) return null;
                  return (
                    <div key={cat} style={{ height: `${(value / total) * 100}%`, background: colors[cat] ?? "#94a3b8" }} />
                  );
                })}
              </div>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          );
        })}
      </div>
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
