import type { ReportCard } from "@/lib/types";

const GRADING = [
  { range: "80 – 100", letter: "A+" },
  { range: "70 - 79", letter: "A" },
  { range: "60 – 69", letter: "B" },
  { range: "50 – 59", letter: "C" },
  { range: "40 – 49", letter: "D" },
  { range: "Below 40", letter: "Unqualified" },
];

function num(value: number | string | null | undefined) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMarks(value: number | string | null | undefined) {
  const n = num(value);
  return n == null ? "" : String(n);
}

function studentName(card: ReportCard) {
  return `${card.student?.firstName ?? ""} ${card.student?.lastName ?? ""}`.replace(/\s+/g, " ").trim();
}

function issuedMonth(card: ReportCard) {
  const date = card.generatedAt ? new Date(card.generatedAt) : new Date();
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function issuedDate(card: ReportCard) {
  const date = card.generatedAt ? new Date(card.generatedAt) : new Date();
  return date.toLocaleDateString("en-GB");
}

function showGradingKey(code?: string | null) {
  return code === "CLASS_1_3" || code === "CLASS_4_8";
}

function showFather(code?: string | null) {
  return code === "CLASS_1_3" || code === "CLASS_4_8";
}

function showStream(code?: string | null) {
  return code === "CLASS_9" || code === "CLASS_10";
}

function showRank(code?: string | null) {
  return code !== "CLASS_9";
}

export function ReportCardSheet({ card }: { card: ReportCard }) {
  const code = card.templateCode;
  const examTitle = card.examTitle || card.termLabel;
  const classLabel =
    code === "CLASS_10"
      ? "CLASS X"
      : code === "CLASS_9"
        ? "CLASS IX"
        : code === "CLASS_1_3"
          ? "1 to 3"
          : code === "CLASS_4_8"
            ? "4 to 8"
            : card.grade?.name;
  const lines = card.lines ?? [];
  const totalMax = num(card.totalMax);
  const totalObtained = num(card.totalObtained);
  const percentage = num(card.overallPercentage);

  return (
    <article className="report-card-sheet break-inside-avoid border border-black bg-white p-6 text-black">
      <header className="text-center">
        <p className="text-xl font-bold tracking-[0.2em]">{(card.school?.name || "THE PIERCING STARS").toUpperCase()}</p>
        <p className="mt-1 text-sm font-semibold tracking-[0.18em]">PROGRESS REPORT</p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide">{examTitle}</p>
        <p className="mt-1 text-right text-sm font-semibold uppercase">{classLabel}</p>
      </header>

      {showFather(code) ? (
        <div className="mt-4 grid grid-cols-[auto_1fr_auto_1fr] items-end gap-x-3 gap-y-2 border-b border-black pb-3 text-sm">
          <span className="font-semibold">STUDENT’s NAME:</span>
          <span className="border-b border-black px-1">{studentName(card)}</span>
          <span className="font-semibold">CLASS:</span>
          <span className="border-b border-black px-1">{card.grade?.name}</span>
          <span className="font-semibold">FATHER’s NAME:</span>
          <span className="border-b border-black px-1">{card.fatherName ?? ""}</span>
          <span className="font-semibold">DATE:</span>
          <span className="border-b border-black px-1">{issuedDate(card)}</span>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
          <p className="font-semibold uppercase">{studentName(card)}</p>
          <p className="text-right">{issuedMonth(card)}</p>
          {showStream(code) ? <p>{card.streamLabel || card.student?.scienceGroup || ""}</p> : <span />}
        </div>
      )}

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr>
            {["SUBJECTS", "TOTAL MARKS", "OBTAINED MARKS", "REMARKS"].map((head) => (
              <th key={head} className="border border-black px-2 py-1 text-left font-semibold">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const arts = line.includeInTotal === false || /arts/i.test(line.title || line.subject?.name || "");
            return (
              <tr key={`${line.title ?? line.subject?.name}-${index}`}>
                <td className="border border-black px-2 py-1">{line.title || line.subject?.name}</td>
                <td className="border border-black px-2 py-1">
                  {arts ? "Grade" : formatMarks(line.maxMarks)}
                </td>
                <td className="border border-black px-2 py-1">
                  {arts ? line.gradeLetter : formatMarks(line.obtainedMarks)}
                </td>
                <td className="border border-black px-2 py-1">{line.remarks ?? ""}</td>
              </tr>
            );
          })}
          <tr className="font-semibold">
            <td className="border border-black px-2 py-1">TOTAL</td>
            <td className="border border-black px-2 py-1">{totalMax ?? ""}</td>
            <td className="border border-black px-2 py-1">{totalObtained ?? ""}</td>
            <td className="border border-black px-2 py-1">
              {showFather(code) && showRank(code) ? `RANK ${card.rank ?? ""}` : ""}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 text-sm font-semibold uppercase">
        <p>Grade {card.overallGrade ?? ""}</p>
        {showRank(code) && !showFather(code) ? <p>Rank {card.rank ?? ""}</p> : null}
        <p>Percentage {percentage == null ? "" : `${percentage}%`}</p>
      </div>

      <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs">
        {["TEACHER’s", "PRINCIPAL’s", "PARENT’s"].map((label) => (
          <div key={label}>
            <div className="mb-8 border-b border-black" />
            <p className="font-semibold tracking-wide">{label}</p>
            <p>SIGNATURE</p>
          </div>
        ))}
      </div>

      {showGradingKey(code) ? (
        <div className="mt-8 text-xs">
          <p className="mb-2 font-bold tracking-wide">GRADING SYSTEM</p>
          <table className="w-48 border-collapse">
            <tbody>
              {GRADING.map((row) => (
                <tr key={row.letter}>
                  <td className="border border-black px-2 py-0.5">{row.range}</td>
                  <td className="border border-black px-2 py-0.5">{row.letter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <footer className="mt-8 text-center text-xs">
        <p>{card.school?.address || "Plot no 312, Pedro D’Souza Road, Garden East, Karachi"}</p>
        <p>Contact: {card.school?.phone || "0315-8260008, 0334-3114395"}</p>
      </footer>
    </article>
  );
}
