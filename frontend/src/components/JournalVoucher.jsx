import {
  fiscalPeriodLabel,
  formatAccountingDate,
  formatAccountingDateTime,
  formatJournalAmount,
  formatJournalAmountAlways,
  formatShortId,
  formatSubsidiaryMember,
  formatSubsidiaryVendor,
  getJvNumber,
  getSourceDocument,
  journalSourceLabel,
  lineAmount,
  summarizeJournalLines,
} from "../lib/journalFormat.js";
import { printJournalVoucher } from "../lib/journalPrint.js";

function MetaField({ label, value, mono = false, className = "" }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className={className}>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-semibold text-slate-900 ${mono ? "font-mono text-xs break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = String(status ?? "").toUpperCase();
  const styles = {
    POSTED: "bg-emerald-100 text-emerald-900 ring-emerald-200",
    PENDING_APPROVAL: "bg-amber-100 text-amber-950 ring-amber-200",
    VOID: "bg-slate-100 text-slate-600 ring-slate-200",
    DRAFT: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  const labels = {
    POSTED: "Posted",
    PENDING_APPROVAL: "Pending approval",
    VOID: "Void",
    DRAFT: "Draft",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1 ${styles[s] ?? "bg-slate-100 text-slate-700 ring-slate-200"}`}
    >
      {labels[s] ?? status}
    </span>
  );
}

/**
 * Standard general-journal line grid (PH cooperative / electronic GL layout).
 * Includes subsidiary columns for member and vendor ledgers.
 */
export function JournalLinesTable({
  lines,
  currency = "PHP",
  compact = false,
  showSubsidiary = true,
  headerParticipantId = null,
}) {
  const { sorted, totalDebit, totalCredit, balanced } = summarizeJournalLines(lines, currency);
  const cell = compact ? "px-2 py-1.5" : "px-3 py-2";
  const head = compact ? "px-2 py-2" : "px-3 py-2.5";
  const labelColSpan = showSubsidiary ? 4 : 2;

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-500 italic">No journal lines.</p>;
  }

  return (
    <div className="journal-lines-table overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/95 text-left">
            <th className={`${head} w-[5.5rem] font-bold uppercase tracking-wide text-[10px] text-slate-600`}>
              Code
            </th>
            <th className={`${head} font-bold uppercase tracking-wide text-[10px] text-slate-600`}>
              Account title
            </th>
            {showSubsidiary ? (
              <>
                <th className={`${head} w-[6.5rem] font-bold uppercase tracking-wide text-[10px] text-slate-600`}>
                  Member
                </th>
                <th className={`${head} w-[7.5rem] font-bold uppercase tracking-wide text-[10px] text-slate-600`}>
                  Vendor
                </th>
              </>
            ) : null}
            <th
              className={`${head} w-[7rem] text-right font-bold uppercase tracking-wide text-[10px] text-slate-600`}
            >
              Debit (₱)
            </th>
            <th
              className={`${head} w-[7rem] text-right font-bold uppercase tracking-wide text-[10px] text-slate-600`}
            >
              Credit (₱)
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((line) => {
            const dr = lineAmount(line.debit);
            const cr = lineAmount(line.credit);
            const member = formatSubsidiaryMember(line, headerParticipantId);
            const vendor = formatSubsidiaryVendor(line);
            return (
              <tr key={line.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                <td className={`${cell} font-mono text-xs font-semibold text-slate-800 tabular-nums`}>
                  {line.account?.code ?? "—"}
                </td>
                <td className={`${cell} text-slate-800`}>
                  <span className="font-medium">{line.account?.title ?? line.account?.name ?? "—"}</span>
                </td>
                {showSubsidiary ? (
                  <>
                    <td className={`${cell} font-mono text-[11px] text-slate-600`} title={line.memberId ?? ""}>
                      {member || "—"}
                    </td>
                    <td className={`${cell} text-[11px] text-slate-600`} title={vendor}>
                      {vendor || "—"}
                    </td>
                  </>
                ) : null}
                <td className={`${cell} text-right font-mono text-sm tabular-nums text-slate-900`}>
                  {dr > 0 ? formatJournalAmount(dr, currency) : ""}
                </td>
                <td className={`${cell} text-right font-mono text-sm tabular-nums text-slate-900`}>
                  {cr > 0 ? formatJournalAmount(cr, currency) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
            <td
              colSpan={labelColSpan}
              className={`${cell} text-right text-xs font-black uppercase tracking-wide text-slate-600`}
            >
              Totals
            </td>
            <td className={`${cell} text-right font-mono tabular-nums text-slate-900`}>
              {formatJournalAmountAlways(totalDebit, currency)}
            </td>
            <td className={`${cell} text-right font-mono tabular-nums text-slate-900`}>
              {formatJournalAmountAlways(totalCredit, currency)}
            </td>
          </tr>
        </tfoot>
      </table>
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs ${balanced ? "border-emerald-200 bg-emerald-50/80 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}
        role="status"
      >
        <span className="font-semibold">
          {balanced ? "✓ Entry is balanced (total debits = total credits)" : "⚠ Entry is out of balance — review lines"}
        </span>
        <span className="font-mono tabular-nums text-[11px] opacity-90">
          Dr {formatJournalAmountAlways(totalDebit, currency)} · Cr{" "}
          {formatJournalAmountAlways(totalCredit, currency)}
        </span>
      </div>
    </div>
  );
}

/**
 * Posted or pending journal voucher — header + particulars + standard line grid.
 */
export function JournalVoucherCard({ transaction, variant = "posted", children }) {
  const currency = transaction.currency ?? "PHP";
  const jv = getJvNumber(transaction);
  const sourceDoc = getSourceDocument(transaction);
  const ext =
    transaction.integrationEvent?.externalId ??
    (transaction.reference && transaction.reference !== jv ? transaction.reference : null);
  const source = journalSourceLabel(transaction.source ?? transaction.integrationEvent?.source);
  const txnDate = transaction.transactionDate ?? transaction.occurredAt;
  const postedAt = transaction.postedAt;
  const particulars = transaction.description ?? transaction.memo ?? "—";
  const memo =
    transaction.memo && transaction.description && transaction.memo !== transaction.description
      ? transaction.memo
      : null;
  const period = fiscalPeriodLabel(transaction.fiscalPeriod);
  const headerMember = transaction.participantId ?? null;

  return (
    <article
      className="journal-voucher-card overflow-hidden rounded-xl border bg-white shadow-sm"
      style={{ borderColor: "var(--b2c-border)" }}
      data-jv={jv}
    >
      <header className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--b2c-forest-900)]">
              General journal voucher
            </p>
            <h3 className="font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{jv}</h3>
            <p className="text-sm font-medium leading-snug text-slate-700">{particulars}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => printJournalVoucher(transaction)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:border-[var(--b2c-forest-900)] hover:text-[var(--b2c-forest-900)] print:hidden"
              title="Print or save as PDF via your browser"
            >
              Print / PDF
            </button>
            <StatusBadge status={transaction.status} />
            <span className="rounded-md bg-[var(--b2c-mint-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--b2c-forest-900)] ring-1 ring-[var(--b2c-border)]">
              {source}
            </span>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetaField label="Transaction date" value={formatAccountingDate(txnDate)} />
          <MetaField
            label={variant === "posted" ? "Date posted" : "Submitted"}
            value={postedAt ? formatAccountingDateTime(postedAt) : formatAccountingDate(txnDate)}
          />
          <MetaField label="Fiscal period" value={period || "—"} />
          <MetaField label="Currency" value={currency} />
          {sourceDoc ? <MetaField label="Source document" value={sourceDoc} /> : null}
          {ext ? <MetaField label="External reference" value={ext} mono className="sm:col-span-2" /> : null}
          {headerMember ? (
            <MetaField label="Member (subsidiary)" value={formatShortId(headerMember)} mono />
          ) : null}
          {transaction.amount != null ? (
            <MetaField label="Header amount" value={formatJournalAmountAlways(transaction.amount, currency)} />
          ) : null}
          {memo ? <MetaField label="Memo" value={memo} className="sm:col-span-2 lg:col-span-4" /> : null}
        </dl>
      </header>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <p className="text-[11px] font-medium leading-relaxed text-slate-500">
          Double-entry per cooperative books (₱). Member and vendor columns trace subsidiary ledgers (patronage,
          accounts payable).
        </p>
        <JournalLinesTable
          lines={transaction.entries ?? transaction.lines ?? []}
          currency={currency}
          headerParticipantId={headerMember}
        />
        {children ? <div className="border-t border-slate-100 pt-4">{children}</div> : null}
      </div>
    </article>
  );
}
