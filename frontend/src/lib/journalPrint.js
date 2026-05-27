import {
  fiscalPeriodLabel,
  formatAccountingDate,
  formatAccountingDateTime,
  formatJournalAmount,
  formatJournalAmountAlways,
  formatSubsidiaryMember,
  formatSubsidiaryVendor,
  getJvNumber,
  getSourceDocument,
  journalSourceLabel,
  lineAmount,
  summarizeJournalLines,
} from "./journalFormat.js";

const COOP_NAME = "B2C Consumers Cooperative";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildVoucherHtml(transaction, { compact = false } = {}) {
  const currency = transaction.currency ?? "PHP";
  const lines = transaction.entries ?? transaction.lines ?? [];
  const { sorted, totalDebit, totalCredit, balanced } = summarizeJournalLines(lines, currency);
  const jv = getJvNumber(transaction);
  const sourceDoc = getSourceDocument(transaction);
  const ext =
    transaction.integrationEvent?.externalId ??
    (transaction.reference !== jv ? transaction.reference : null);
  const particulars = transaction.description ?? transaction.memo ?? "";
  const txnDate = transaction.transactionDate ?? transaction.occurredAt;
  const postedAt = transaction.postedAt;
  const period = fiscalPeriodLabel(transaction.fiscalPeriod);
  const headerMember = transaction.participantId ?? null;

  const rowHtml =
    sorted.length > 0
      ? sorted
          .map((line) => {
            const dr = lineAmount(line.debit);
            const cr = lineAmount(line.credit);
            const member = formatSubsidiaryMember(line, headerMember);
            const vendor = formatSubsidiaryVendor(line);
            return `<tr>
        <td class="mono">${escapeHtml(line.account?.code ?? "—")}</td>
        <td>${escapeHtml(line.account?.title ?? line.account?.name ?? "—")}</td>
        <td class="sub">${escapeHtml(member || "—")}</td>
        <td class="sub">${escapeHtml(vendor || "—")}</td>
        <td class="num">${dr > 0 ? escapeHtml(formatJournalAmount(dr, currency)) : ""}</td>
        <td class="num">${cr > 0 ? escapeHtml(formatJournalAmount(cr, currency)) : ""}</td>
      </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="empty">No journal lines on this voucher.</td></tr>`;

  return `
    <section class="voucher${compact ? " compact" : ""}">
      <header class="hdr">
        <p class="coop">${escapeHtml(COOP_NAME)}</p>
        <h1>General Journal Voucher</h1>
        <p class="jv">${escapeHtml(jv)}</p>
      </header>
      <table class="meta">
        <tr>
          <th>Transaction date</th><td>${escapeHtml(formatAccountingDate(txnDate))}</td>
          <th>Date posted</th><td>${escapeHtml(postedAt ? formatAccountingDateTime(postedAt) : "—")}</td>
        </tr>
        <tr>
          <th>Fiscal period</th><td>${escapeHtml(period || "—")}</td>
          <th>Source</th><td>${escapeHtml(journalSourceLabel(transaction.source ?? transaction.integrationEvent?.source))}</td>
        </tr>
        ${sourceDoc ? `<tr><th>Source document</th><td colspan="3">${escapeHtml(sourceDoc)}</td></tr>` : ""}
        ${ext ? `<tr><th>External ref</th><td colspan="3" class="mono">${escapeHtml(ext)}</td></tr>` : ""}
        ${headerMember ? `<tr><th>Member ref</th><td colspan="3" class="mono">${escapeHtml(headerMember)}</td></tr>` : ""}
        <tr><th>Particulars</th><td colspan="3">${escapeHtml(particulars)}</td></tr>
      </table>
      <table class="lines">
        <thead>
          <tr>
            <th>Code</th><th>Account title</th><th>Member</th><th>Vendor</th>
            <th class="num">Debit (PHP)</th><th class="num">Credit (PHP)</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
        <tfoot>
          <tr class="totals">
            <td colspan="4" class="right">Totals</td>
            <td class="num">${escapeHtml(formatJournalAmountAlways(totalDebit, currency))}</td>
            <td class="num">${escapeHtml(formatJournalAmountAlways(totalCredit, currency))}</td>
          </tr>
        </tfoot>
      </table>
      <p class="balance ${balanced ? "ok" : "bad"}">
        ${balanced ? "Balanced — total debits equal total credits." : "OUT OF BALANCE — do not post."}
      </p>
      <footer class="sign">
        <div>Prepared by: _________________________</div>
        <div>Approved by: _________________________</div>
        <div>Date: _________________________</div>
      </footer>
    </section>
  `;
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; font-size: 11pt; color: #0f172a; margin: 0; padding: 12mm; background: #fff; }
  .voucher { page-break-after: always; max-width: 210mm; margin: 0 auto 16mm; }
  .voucher:last-child { page-break-after: auto; }
  .hdr { text-align: center; border-bottom: 2px solid #004aad; padding-bottom: 8px; margin-bottom: 12px; }
  .coop { font-size: 10pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #004aad; margin: 0; }
  h1 { font-size: 14pt; margin: 4px 0; text-transform: uppercase; }
  .jv { font-family: ui-monospace, monospace; font-size: 16pt; font-weight: 800; margin: 4px 0 0; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }
  .meta th { text-align: left; width: 22%; padding: 4px 8px 4px 0; color: #475569; font-weight: 600; vertical-align: top; }
  .meta td { padding: 4px 0; }
  .lines { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .lines th, .lines td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
  .lines th { background: #f1f5f9; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .lines .num, .num { text-align: right; font-family: ui-monospace, monospace; white-space: nowrap; }
  .lines .sub { font-size: 9pt; color: #475569; max-width: 28mm; }
  .lines .mono { font-family: ui-monospace, monospace; font-size: 9pt; }
  .lines .right { text-align: right; font-weight: 700; text-transform: uppercase; font-size: 8pt; }
  .lines .empty { text-align: center; color: #64748b; font-style: italic; padding: 16px; }
  .totals td { font-weight: 700; background: #f8fafc; }
  .balance { font-size: 10pt; font-weight: 600; margin: 8px 0 16px; padding: 6px 10px; border-radius: 4px; }
  .balance.ok { background: #ecfdf5; color: #065f46; }
  .balance.bad { background: #fef2f2; color: #991b1b; }
  .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 24px; font-size: 9pt; color: #475569; }
  @media print {
    body { padding: 8mm; }
    @page { margin: 10mm; }
  }
`;

function buildPrintDocument(transactions, title) {
  const list = Array.isArray(transactions) ? transactions : [transactions];
  const body = list.map((t) => buildVoucherHtml(t)).join("");
  return `<!DOCTYPE html>
<html lang="en-PH">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — ${escapeHtml(getJvNumber(list[0]))}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>${body}
<script>
  window.addEventListener("load", function () {
    setTimeout(function () {
      window.focus();
      window.print();
    }, 250);
  });
</script>
</body>
</html>`;
}

/** Hidden iframe — works when pop-ups are blocked or document.write fails. */
function printViaIframe(html) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Journal print preview");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return false;
  }

  const cleanup = () => {
    setTimeout(() => iframe.remove(), 1000);
  };

  win.addEventListener("load", () => {
    setTimeout(() => {
      win.focus();
      win.print();
      cleanup();
    }, 300);
  });

  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* ignore */
    }
    cleanup();
  }, 800);

  return true;
}

/** Open printable HTML via blob URL (avoids blank window from document.write + noopener). */
function printViaBlobWindow(html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");

  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }

  const revokeLater = () => setTimeout(() => URL.revokeObjectURL(url), 120_000);
  win.addEventListener("load", revokeLater);
  setTimeout(revokeLater, 120_000);
  return true;
}

export function printJournalVouchers(transactions, { title = "General Journal" } = {}) {
  const list = Array.isArray(transactions) ? transactions : [transactions];
  if (list.length === 0) {
    window.alert("No journals selected to print.");
    return;
  }

  let html;
  try {
    html = buildPrintDocument(list, title);
  } catch (err) {
    console.error(err);
    window.alert(err instanceof Error ? err.message : "Could not build print layout.");
    return;
  }

  if (printViaBlobWindow(html)) return;

  if (printViaIframe(html)) return;

  window.alert("Could not open print preview. Allow pop-ups for this site and try again.");
}

export function printJournalVoucher(transaction) {
  printJournalVouchers([transaction], { title: `JV ${getJvNumber(transaction)}` });
}
