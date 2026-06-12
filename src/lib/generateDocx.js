import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  ImageRun, PageBreak, LevelFormat,
} from "docx";

const PURPLE = "51037C";
const DEEP = "3A1955";
const RED = "B91C1C";
const GREY = "475569";

const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const fmt = (n, dp = 0) => {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const money = (n, dp = 0) => "$" + fmt(n, dp);
const todayLong = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ---- paragraph helpers ----
const P = (text, opts = {}) => new Paragraph({
  alignment: opts.align || AlignmentType.JUSTIFIED,
  spacing: { after: 120, line: 300 },
  children: [new TextRun({ text: text || "", bold: !!opts.bold, italics: !!opts.italics, color: opts.color, size: opts.size, font: "Calibri" })],
  ...(opts.heading ? { heading: opts.heading } : {}),
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 320, after: 160 },
  children: [new TextRun({ text, bold: true, color: PURPLE, size: 36, font: "Cambria" })],
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 100 },
  children: [new TextRun({ text, bold: true, color: DEEP, size: 26, font: "Cambria" })],
});

const splitParas = (text) => (text || "").split(/\n\n+/).filter(Boolean).map(p => P(p.trim()));

// ---- table helpers ----
const thinBorder = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

const cell = (content, opts = {}) => {
  const children = Array.isArray(content) ? content : [
    new Paragraph({
      alignment: opts.align || AlignmentType.LEFT,
      children: [new TextRun({ text: String(content ?? ""), bold: !!opts.bold, color: opts.color, size: 20, font: "Calibri" })],
    }),
  ];
  return new TableCell({
    borders: cellBorders,
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children,
  });
};

const headerCell = (text, width) => new TableCell({
  borders: cellBorders,
  width: width ? { size: width, type: WidthType.DXA } : undefined,
  shading: { fill: PURPLE, type: ShadingType.CLEAR, color: "auto" },
  margins: { top: 100, bottom: 100, left: 120, right: 120 },
  children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20, font: "Calibri" })] })],
});

const buildTable = (headers, rows, widths) => {
  const totalWidth = widths ? widths.reduce((a, b) => a + b, 0) : 9000;
  const colWidths = widths || headers.map(() => Math.floor(totalWidth / headers.length));
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      ...(headers.length ? [new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => headerCell(h, colWidths[i])),
      })] : []),
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => {
          if (c && typeof c === "object" && "text" in c) {
            return cell(c.text, { ...c, width: colWidths[i] });
          }
          return cell(c, { width: colWidths[i] });
        }),
      })),
    ],
  });
};

// ---- plan body renderer (bullets, limitations, paras) ----
function renderPlanBody(body) {
  const out = [];
  if (!body) return out;
  const lines = body.split("\n").map(l => l.trim()).filter(Boolean);
  lines.forEach(line => {
    if (line === "Plan Limitations:" || line === "Plan Limitation:") {
      out.push(new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [new TextRun({ text: "Plan Limitations", bold: true, color: RED, size: 20, font: "Calibri" })],
      }));
    } else if (line.startsWith("∴")) {
      out.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 360, hanging: 200 },
        spacing: { after: 60 },
        children: [new TextRun({ text: "∴  " + line.replace(/^∴\s*/, ""), color: RED, size: 20, font: "Calibri" })],
      }));
    } else if (line.startsWith("•")) {
      const text = line.replace(/^•\s*/, "");
      const dashIdx = text.indexOf(" — ");
      const colonIdx = text.indexOf(": ");
      const splitAt = dashIdx !== -1 ? dashIdx : (colonIdx !== -1 && colonIdx < 50 ? colonIdx : -1);
      const children = [new TextRun({ text: "•  ", bold: true, color: PURPLE, size: 20, font: "Calibri" })];
      if (splitAt !== -1) {
        children.push(new TextRun({ text: text.slice(0, splitAt), bold: true, color: DEEP, size: 20, font: "Calibri" }));
        children.push(new TextRun({ text: (dashIdx !== -1 ? " — " : ": ") + text.slice(splitAt + (dashIdx !== -1 ? 3 : 2)), color: GREY, size: 20, font: "Calibri" }));
      } else {
        children.push(new TextRun({ text, size: 20, font: "Calibri" }));
      }
      out.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 360, hanging: 200 },
        spacing: { after: 80 },
        children,
      }));
    } else {
      out.push(P(line));
    }
  });
  return out;
}

async function fetchImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch { return null; }
}

function imageType(url) {
  const u = (url || "").toLowerCase();
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "jpg";
  if (u.endsWith(".gif")) return "gif";
  return "png";
}

export async function generateDocx({ client, d, planLibrary, tierMeta, logoUrl }) {
  const children = [];

  // ---- Cover ----
  const logoBuf = logoUrl ? await fetchImage(logoUrl) : null;
  if (logoBuf) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 240 },
      children: [new ImageRun({ type: imageType(logoUrl), data: logoBuf, transformation: { width: 320, height: 110 } })],
    }));
  }
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 240 },
    children: [new TextRun({ text: "Affiliated with Nancy Group · in association with AIA Brunei", size: 16, color: GREY, font: "Calibri" })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "Recommendation Report", size: 28, italics: true, color: GREY, font: "Cambria" })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "specially prepared for", size: 24, italics: true, color: GREY, font: "Cambria" })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 400 },
    children: [new TextRun({ text: (client.name || "—").toUpperCase(), bold: true, size: 44, color: PURPLE, font: "Cambria" })],
  }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Prepared by Abdul Azim Saifuddin", bold: true, size: 22, font: "Calibri" })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "BSc, CFP — Financial Planning Service Provider", size: 20, font: "Calibri" })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "AIA Senior Life Advisor", size: 20, font: "Calibri" })] }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({
      text: (client.meetingDate ? "Based on our meeting of " + client.meetingDate + " · " : "") + "Prepared " + todayLong(),
      size: 18, color: GREY, italics: true, font: "Calibri",
    })],
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 1. Executive Summary ----
  children.push(H1("1. Executive Summary"));
  if (client.narrative?.exec) {
    children.push(...splitParas(client.narrative.exec));
  } else {
    children.push(P("No executive summary drafted.", { italics: true, color: GREY }));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 2. Your Finances ----
  children.push(H1("2. Your Finances"));
  children.push(P("Your risk preference serves as a guide to determine your investment risk profile. From our fact-find, we identified your risk preference as " + (client.riskProfile || "n/a") + "."));

  children.push(H2("Net Worth"));
  children.push(buildTable([], [
    ["Total Personal Assets", { text: money(d.personal), align: AlignmentType.RIGHT }],
    ["Total Invested Assets", { text: money(d.invested), align: AlignmentType.RIGHT }],
    ["Total Cash / Cash Equivalents", { text: money(d.cash), align: AlignmentType.RIGHT }],
    [{ text: "Total Assets", bold: true }, { text: money(d.totalAssets), bold: true, align: AlignmentType.RIGHT }],
    ["Total Liabilities", { text: "(" + money(d.totalLiab) + ")", align: AlignmentType.RIGHT }],
    [{ text: "NET WORTH", bold: true, color: PURPLE }, { text: money(d.netWorth), bold: true, color: PURPLE, align: AlignmentType.RIGHT }],
  ], [5400, 3600]));

  children.push(H2("2.1 Cash Flow Summary"));
  children.push(buildTable([], [
    ["Net Income (take-home)", { text: money(d.net) + " / month", align: AlignmentType.RIGHT }],
    ["Total Expenses", { text: "(" + money(d.totalExpenses) + ") / month", align: AlignmentType.RIGHT }],
    [{ text: d.surplus >= 0 ? "Surplus" : "Shortfall", bold: true }, { text: money(Math.abs(d.surplus)) + " / month", bold: true, color: d.surplus >= 0 ? PURPLE : RED, align: AlignmentType.RIGHT }],
  ], [5400, 3600]));

  children.push(H2("4-3-2-1 Allocation"));
  children.push(buildTable(
    ["Allocation", "Guideline", "Optimal $/mo", "Current $/mo", "Current %"],
    d.alloc.map(a => [
      a.label,
      { text: (a.pct * 100) + "%", align: AlignmentType.RIGHT },
      { text: money(a.optimal), align: AlignmentType.RIGHT },
      { text: money(a.current), align: AlignmentType.RIGHT },
      { text: fmt(a.curPct * 100, 0) + "%", align: AlignmentType.RIGHT },
    ]),
    [3000, 1500, 1500, 1500, 1500],
  ));

  children.push(H2("2.2 Financial Ratio Analysis"));
  children.push(buildTable(
    ["Ratio", "Benchmark", "Yours", "Reading"],
    d.ratios.map(r => [
      { text: r.name, bold: true },
      { text: (r.dir === ">=" ? "≥ " : "≤ ") + (r.id === "liquidity" ? r.target + " mo" : fmt(r.target * 100, 0) + "%"), align: AlignmentType.RIGHT },
      { text: r.value == null ? "—" : r.fmtV(r.value), align: AlignmentType.RIGHT },
      { text: r.pass == null ? "n/a" : r.pass ? "Healthy" : "Needs attention", bold: true, color: r.pass == null ? undefined : (r.pass ? PURPLE : RED) },
    ]),
    [3600, 1800, 1600, 2000],
  ));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 3. Objectives ----
  children.push(H1("3. Your Concerns & Objectives"));
  children.push(H2("3.1 Income Replacement"));
  children.push(P("To provide an income of " + money(num(client.incomeReplacement.monthly)) + " per month in the event of premature death or total permanent disability, for " + client.incomeReplacement.years + " years from today (potential income of " + money(d.potentialIncome) + ")."));
  children.push(buildTable(
    ["Need", "Guideline", "Benchmark", "Current", "Shortfall"],
    d.irRows.map(r => [
      r.name, r.guideline,
      { text: money(r.bench), align: AlignmentType.RIGHT },
      { text: money(r.current), align: AlignmentType.RIGHT },
      { text: money(r.shortfall), align: AlignmentType.RIGHT, bold: r.shortfall > 0, color: r.shortfall > 0 ? RED : PURPLE },
    ]),
    [2400, 2400, 1400, 1400, 1400],
  ));

  children.push(H2("3.2 Retirement Planning"));
  children.push(P("To provide a minimum of " + money(num(client.retirement.monthly)) + " per month for " + client.retirement.years + " years after retirement."));
  children.push(buildTable([], [
    ["Amount required (" + client.retirement.years + " years)", { text: money(d.rtRequired), align: AlignmentType.RIGHT }],
    ["Inflation-adjusted (" + client.retirement.inflation + "% over " + client.retirement.yearsToRetire + " years)", { text: money(d.rtAdjusted), align: AlignmentType.RIGHT }],
    ["SPK (Member Account, projected)", { text: money(num(client.retirement.spkProj)), align: AlignmentType.RIGHT }],
    ["SPK Annuity (Employer)", { text: money(d.spkAnnuityTotal), align: AlignmentType.RIGHT }],
    ["Old Age Pension", { text: money(num(client.retirement.pension)), align: AlignmentType.RIGHT }],
    ["Other: Annuities (projected)", { text: money(d.annTotal), align: AlignmentType.RIGHT }],
    ["Other: Investments (projected)", { text: money(d.invTotal), align: AlignmentType.RIGHT }],
    [{ text: "Total projected arrangement", bold: true }, { text: money(d.rtProjected), bold: true, align: AlignmentType.RIGHT }],
    [{ text: "Projected shortfall", bold: true }, { text: money(d.rtShortfall), bold: true, color: d.rtShortfall > 0 ? RED : PURPLE, align: AlignmentType.RIGHT }],
  ], [5400, 3600]));

  const otherObj = (client.otherObjectives || []).filter(o => o.name || num(o.target) > 0);
  if (otherObj.length) {
    children.push(H2("3.3 Other Objectives"));
    children.push(buildTable(
      ["Objective", "Remarks", "Target", "Horizon", "Indicative saving"],
      otherObj.map(o => [
        o.name || "", o.note || "",
        { text: money(num(o.target)), align: AlignmentType.RIGHT },
        { text: num(o.years) > 0 ? o.years + " yrs" : "—", align: AlignmentType.RIGHT },
        { text: num(o.target) > 0 && num(o.years) > 0 ? money(num(o.target) / (num(o.years) * 12)) + "/mo" : "—", align: AlignmentType.RIGHT },
      ]),
      [2200, 2200, 1500, 1500, 1600],
    ));
  }
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ---- 4. Recommendation ----
  children.push(H1("4. Recommendation"));
  if (client.narrative?.recoIntro) {
    children.push(...splitParas(client.narrative.recoIntro));
  }
  if (client.narrative?.actionPlan) {
    children.push(H2("Action Plan"));
    children.push(...splitParas(client.narrative.actionPlan));
  }

  children.push(H2("4.1 Recommended Plans"));
  children.push(P("The main purpose of these plan recommendations is to prioritise protecting your income and to prepare funds for retirement."));
  children.push(buildTable([], [
    ["Emergency fund needed (3–6 months)", { text: money(d.ef3) + " – " + money(d.ef6), align: AlignmentType.RIGHT }],
    ["Amount saved", { text: money(d.cash), align: AlignmentType.RIGHT }],
    [{ text: d.cash >= d.ef3 ? "Within target" : "Shortfall to 3-month target", bold: true }, { text: money(Math.max(0, d.ef3 - d.cash)), bold: true, color: d.cash >= d.ef3 ? PURPLE : RED, align: AlignmentType.RIGHT }],
  ], [5400, 3600]));

  const cats = ["Risk Management", "Goal Planning", "Retirement Planning"];
  cats.forEach(cat => {
    const items = d.selected.filter(p => p.category === cat);
    if (!items.length) return;
    children.push(H2(cat));
    children.push(buildTable(
      ["Plan", "Coverage", "Monthly", "Annual", "Projected returns"],
      items.map(p => [
        { text: p.label + (tierMeta?.[p.tier] ? "  [" + tierMeta[p.tier].label + "]" : ""), bold: true },
        p.coverage || "",
        { text: money(num(p.monthly), 2), align: AlignmentType.RIGHT },
        { text: money(num(p.annual), 2), align: AlignmentType.RIGHT },
        p.returns || "",
      ]),
      [2800, 1600, 1300, 1300, 2000],
    ));
  });
  if (d.selected.length) {
    children.push(buildTable([], [
      [{ text: "Total of plans shown", bold: true }, { text: money(d.premMonthly, 2) + " / month · " + money(d.premAnnual, 2) / 1 + " / year", bold: true, align: AlignmentType.RIGHT }],
    ], [5400, 3600]));
  }

  // ---- 5. Plan Explanations ----
  if (d.selected.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(H1("5. Explanation of Plan Options"));
    d.selected.forEach((p, i) => {
      const meta = planLibrary?.[p.key];
      children.push(H2((i + 1) + ". " + (meta ? meta.name : p.label)));
      if (meta) children.push(...renderPlanBody(meta.body));
    });
  }

  // ---- 6. Conclusion ----
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(H1((d.selected.length ? "6" : "5") + ". Conclusion"));
  children.push(...splitParas("The above recommendation is based on my best knowledge and professional advice, as if I were in your shoes. All premiums and coverage amounts can be adjusted to your needs. The budget set aside for the above objectives should be around 20–30% of individual income, to encourage progress toward future goals while still enjoying the lifestyle you want during your working years.\n\nThe plan is designed to encourage you to accumulate as much as you can to reduce future shortfalls, and to keep you protected along the course of your joyful life.\n\nIt is advised that we meet at least once a year to review your financial standing and track the progress of your financial plan."));

  children.push(H2("Client Acknowledgement"));
  children.push(...splitParas("I/We understand that the IA will furnish me with a copy of the complete Financial Health Review signed by me/us. I/We acknowledge that the considerations (where applicable) set out in your sales advisory guide have been highlighted and explained to me/us by the IA.\n\nI/We have understood and acknowledge receipt of the following documents in relation to the products recommended: product summary(s) and benefit illustration(s) applicable to life insurance and/or Accident & Health insurance. I/We acknowledge that the fees, charges and commission for the product(s) chosen have been disclosed and explained to me/us by reference to relevant disclosure documents.\n\nThe IA has explained to me/us in detail the recommendations made, and any investment decision has been arrived at independently by me/us without inducement or pressure. I have been informed of the risks of investment in the products recommended and appreciate fully the nature and extent of such risks.\n\nI/We understand that any incomplete or inaccurate information provided by me/us may affect the suitability of any recommendations made."));

  children.push(new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: "_________________________________", font: "Calibri" })] }));
  children.push(P("Client's Signature & Date", { size: 18, color: GREY }));
  children.push(new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "_________________________________", font: "Calibri" })] }));
  children.push(P("IA's Signature & Date", { size: 18, color: GREY }));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (client.name || "Client").replace(/[^a-zA-Z0-9_\- ]/g, "").trim().replace(/\s+/g, "-") || "Client";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "GoodLife-Report-" + safeName + ".docx";
  a.click();
  URL.revokeObjectURL(a.href);
}