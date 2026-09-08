import type { FeeReceipt } from "@/lib/types";
import { formatPkr } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export function receiptWhatsAppText(receipt: FeeReceipt) {
  const school = receipt.school?.name ?? "School";
  return [
    `${school}`,
    `Fee receipt ${receipt.receiptNumber ?? ""}`.trim(),
    `Date: ${formatDate(receipt.paidAt)}`,
    `Student: ${receipt.student.name}`,
    `ID: ${receipt.student.studentCode}`,
    `Class: ${receipt.student.className ?? "—"} ${receipt.student.sectionName ?? ""}`.trim(),
    `${receipt.fee.name} · ${receipt.fee.periodLabel}`,
    `Billed: ${formatPkr(receipt.fee.billed)}`,
    `Collected: ${formatPkr(receipt.collected)}`,
    `Discount: ${formatPkr(receipt.discount)}`,
    `Balance: ${formatPkr(receipt.balance)}`,
    `Received by: ${receipt.receivedBy}`,
    receipt.school?.phone ? `Office: ${receipt.school.phone}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function FeeReceiptSheet({ receipt }: { receipt: FeeReceipt }) {
  return (
    <article className="fee-receipt mx-auto max-w-xl border border-black bg-white p-6 text-black">
      <header className="text-center">
        <p className="text-xl font-bold tracking-wide">{(receipt.school?.name ?? "School").toUpperCase()}</p>
        {receipt.school?.address ? <p className="mt-1 text-xs">{receipt.school.address}</p> : null}
        {receipt.school?.phone ? <p className="text-xs">Contact: {receipt.school.phone}</p> : null}
        <p className="mt-3 text-sm font-semibold tracking-[0.18em]">FEE RECEIPT</p>
        <p className="mt-1 text-sm">No. {receipt.receiptNumber ?? receipt.id.slice(0, 8)}</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <p><span className="text-muted-foreground">Date</span> {formatDate(receipt.paidAt)}</p>
        <p><span className="text-muted-foreground">Method</span> {receipt.method}</p>
        <p className="col-span-2 font-medium">{receipt.student.name}</p>
        <p>Student ID {receipt.student.studentCode}</p>
        <p>
          {receipt.student.className ?? "—"} {receipt.student.sectionName ?? ""}
        </p>
        {receipt.parents[0] ? (
          <p className="col-span-2">
            {receipt.parents[0].relationship}: {receipt.parents[0].name}
            {receipt.parents[0].phone ? ` · ${receipt.parents[0].phone}` : ""}
          </p>
        ) : null}
      </div>

      <table className="mt-4 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1">{receipt.fee.name}</td>
            <td className="border border-black px-2 py-1">{receipt.fee.periodLabel}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">Billed</td>
            <td className="border border-black px-2 py-1">{formatPkr(receipt.fee.billed)}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">Collected</td>
            <td className="border border-black px-2 py-1">{formatPkr(receipt.collected)}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">Discount</td>
            <td className="border border-black px-2 py-1">{formatPkr(receipt.discount)}</td>
          </tr>
          <tr className="font-semibold">
            <td className="border border-black px-2 py-1">Balance</td>
            <td className="border border-black px-2 py-1">{formatPkr(receipt.balance)}</td>
          </tr>
        </tbody>
      </table>

      {receipt.notes ? <p className="mt-3 text-sm">Note: {receipt.notes}</p> : null}

      <div className="mt-10 grid grid-cols-2 gap-6 text-center text-xs">
        <div>
          <div className="mb-8 border-b border-black" />
          <p>Received by</p>
          <p className="font-medium">{receipt.receivedBy}</p>
        </div>
        <div>
          <div className="mb-8 border-b border-black" />
          <p>Parent / guardian</p>
        </div>
      </div>
    </article>
  );
}
