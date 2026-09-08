export function formatPkr(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
}

export function optionalMoney(value?: string | number | null) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function whatsappDigits(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

export function whatsappUrl(phone: string, text: string) {
  const digits = whatsappDigits(phone);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
