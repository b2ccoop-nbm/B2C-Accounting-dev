/** Philippine peso — blank when zero (standard journal column presentation). */
export function formatJournalAmount(value, currency = "PHP") {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatJournalAmountAlways(value, currency = "PHP") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return formatJournalAmount(n, currency) || formatJournalAmount(0, currency);
}

/** Accounting date — day-first, familiar to PH bookkeepers. */
export function formatAccountingDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatAccountingDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function lineAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Debits first, then credits; within each group sort by account code. */
export function sortJournalLines(lines) {
  return [...(lines ?? [])].sort((a, b) => {
    const aDr = lineAmount(a.debit) > 0 ? 0 : 1;
    const bDr = lineAmount(b.debit) > 0 ? 0 : 1;
    if (aDr !== bDr) return aDr - bDr;
    const ac = String(a.account?.code ?? "");
    const bc = String(b.account?.code ?? "");
    return ac.localeCompare(bc, undefined, { numeric: true });
  });
}

export function summarizeJournalLines(lines, currency = "PHP") {
  const sorted = sortJournalLines(lines);
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of sorted) {
    totalDebit += lineAmount(line.debit);
    totalCredit += lineAmount(line.credit);
  }
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;
  return { sorted, totalDebit, totalCredit, balanced, currency };
}

export function journalSourceLabel(source) {
  const s = String(source ?? "").trim();
  if (!s) return "Manual voucher";
  const map = {
    INTEGRATION: "System integration",
    MARKETPLACE: "Marketplace sale",
    WEBAPP: "WebApp",
    VOUCHER: "Manual voucher",
  };
  return map[s.toUpperCase()] ?? s.replace(/_/g, " ");
}

export function getJvNumber(transaction) {
  return transaction?.jvNumber ?? transaction?.reference ?? "—";
}

export function getSourceDocument(transaction) {
  const meta = transaction?.metadata;
  if (meta && typeof meta === "object" && meta.sourceDocument) {
    return String(meta.sourceDocument).trim();
  }
  return "";
}

export function formatShortId(id) {
  if (id == null || id === "") return "";
  const s = String(id).trim();
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

/** Subsidiary ledger — member (participation / patronage) */
export function formatSubsidiaryMember(line, headerParticipantId) {
  const mid = line?.memberId ?? line?.member?.id;
  if (mid) return formatShortId(mid);
  if (headerParticipantId && lineAmount(line?.debit) + lineAmount(line?.credit) > 0) {
    return formatShortId(headerParticipantId);
  }
  return "";
}

/** Subsidiary ledger — vendor (AP / trade payable) */
export function formatSubsidiaryVendor(line) {
  if (line?.vendor?.code) {
    const name = line.vendor.name ? ` — ${line.vendor.name}` : "";
    return `${line.vendor.code}${name}`;
  }
  return "";
}

export function fiscalPeriodLabel(period) {
  if (!period) return "";
  if (period.month) return `${period.year}-${String(period.month).padStart(2, "0")}`;
  return String(period.year);
}
