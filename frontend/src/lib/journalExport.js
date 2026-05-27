import {
  formatAccountingDate,
  formatJournalAmountAlways,
  getJvNumber,
  getSourceDocument,
  journalSourceLabel,
  lineAmount,
  sortJournalLines,
} from "./journalFormat.js";

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export posted journals as CSV (one row per line — standard GL export). */
export function downloadJournalsCsv(transactions, filename = "b2c-posted-journals.csv") {
  const list = Array.isArray(transactions) ? transactions : [];
  const header = [
    "JV No",
    "Transaction date",
    "Posted at",
    "Source",
    "Particulars",
    "Source document",
    "External ref",
    "Account code",
    "Account title",
    "Member ref",
    "Vendor",
    "Debit PHP",
    "Credit PHP",
  ];

  const rows = [header.map(csvCell).join(",")];

  for (const tx of list) {
    const jv = getJvNumber(tx);
    const txnDate = formatAccountingDate(tx.transactionDate);
    const posted = tx.postedAt ? formatAccountingDate(tx.postedAt) : "";
    const source = journalSourceLabel(tx.source ?? tx.integrationEvent?.source);
    const particulars = tx.description ?? "";
    const sourceDoc = getSourceDocument(tx);
    const ext = tx.integrationEvent?.externalId ?? "";
    const headerMember = tx.participantId ?? "";

    const lines = sortJournalLines(tx.entries ?? tx.lines ?? []);
    for (const line of lines) {
      const dr = lineAmount(line.debit);
      const cr = lineAmount(line.credit);
      rows.push(
        [
          jv,
          txnDate,
          posted,
          source,
          particulars,
          sourceDoc,
          ext,
          line.account?.code ?? "",
          line.account?.title ?? "",
          line.memberId ?? headerMember,
          line.vendor?.code ?? "",
          dr > 0 ? dr.toFixed(2) : "",
          cr > 0 ? cr.toFixed(2) : "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadTrialBalanceCsv(report, filename = "b2c-trial-balance.csv") {
  const rows = report?.rows ?? [];
  const header = ["Account code", "Account title", "Type", "Debit total", "Credit total", "Balance"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.code, r.title, r.type, r.debitTotal, r.creditTotal, r.balance].map(csvCell).join(","),
    );
  }
  if (report?.totals) {
    lines.push(
      ["", "TOTALS", "", report.totals.debit, report.totals.credit, ""].map(csvCell).join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
