import React, { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, LabelList } from "recharts";
import logoAsset from "./assets/goodlife-logo.png.asset.json";
import { generateDocx } from "@/lib/generateDocx";
import { toast } from "sonner";

const LOGO = logoAsset.url;

// GoodLife brand palette
const BRAND = { deep: "#3a1955", primary: "#51037c", mid: "#66229d", bright: "#7613ad", seal: "#d62828" };

// ---------- helpers ----------
const fmt = (n, dp = 0) => {
  const v = Number(n);
  if (!isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const money = (n, dp = 0) => "$" + fmt(n, dp);
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const uid = () => Math.random().toString(36).slice(2, 10);
const calcAge = (dob) => {
  if (!dob) return "";
  const d = new Date(dob); if (isNaN(d)) return "";
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
};
const initials = (name) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map(w => w[0].toUpperCase()).join(".") + "." : "";
};
const todayLong = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// ---------- static report copy (from your template, lightly cleaned) ----------
const EDU_SECTIONS = [
  { id: "hierarchy", title: "The Hierarchy of Needs in Financial Planning", body: "The hierarchy of needs in financial planning starts with Contingency Planning, where we first prepare financially for emergencies. The next level is managing financial risk and protecting our assets — and as you are your own biggest asset, you need protection against major financial loss from unforeseen events. This ensures your other financial goals are not disrupted and your standard of living is maintained.\n\nOnce these foundations are in place, we save and invest for other financial goals such as buying a house and preparing for children's education. With those taken care of, we then plan for retirement needs and estate distribution." },
  { id: "moneywork", title: "1.1  Make Your Money Work For You", body: "To reach true financial independence, your money must work for you — not you for it. What differentiates the wealthy from the not-as-wealthy is that wealthy people earn interest while everyone else pays interest.\n\nThe most important concept is to recognise money as a tool that can help you achieve your goals. Liquidity in cash is a strong form of security, but with low interest rates, leaving the entire nest egg in cash is not wise over the medium to long term — inflation alone will erode cash deposits. The logical step is to apportion an amount for investment, giving money a chance to grow.\n\nThere is a correlation between savings, investment, and time: the earlier you start, the less it costs to amass the savings you will need for your retirement years." },
  { id: "fd", title: "1.2  Fixed Deposits Are Interest Based", body: "It is important to know your own investment horizon. If your time horizon is two to three years, more cash deposits are advisable. A short-term portfolio preserves capital, but returns will be lower.\n\nFixed-tenor time deposits offer better interest than a normal savings account, allowing you to make the most of your money. Interest can be compounded weekly, monthly, quarterly or annually — the more often interest compounds, the greater your earnings — though local interest rates remain low." },
  { id: "insurance", title: "1.3  Insurance", body: "Before purchasing any insurance, it is prudent to compare the rate of return of the plan, as this varies across plans and companies. A small increase in the rate of return reaps a big increase in your money over time.\n\nInsurance acts as forced savings — money set aside every month or year that you cannot easily access, which benefits you in the future. More importantly, it provides income protection for your family or loved ones in the event of an unforeseen mishap. This second feature makes saving through insurance advantageous compared to saving through fixed deposits alone." },
  { id: "invest", title: "1.4  For Better Gain, Invest", body: "In making money work, one can never dismiss investing. Most investments do not offer the safety of a bank account and your capital is at risk, but in return you have the potential for higher gains.\n\nFor a medium term of 5 to 10 years, instruments with some risk such as bond funds, properties, equity funds and shares are advisable. For longer terms of more than 10 years, the same instruments are recommended to preserve and grow capital.\n\nRegular portfolio review is important, as your investment mix should shift as your needs change at different life stages. Do not park all your money in one vehicle. One key to successful investing is to hold your asset allocation steady regardless of market noise, unless your financial needs or goals change — your longer-term goals take priority over emotion in uncertain times." },
  { id: "family", title: "1.5  Family Protection", body: "No one can predict the future, but being prepared is one of the best defences against life's uncertainties. We understand how important it is to guard against unfortunate events such as accident, illness, disability or death, by ensuring family and loved ones are well protected.\n\nLife insurance plans offer protection for you and your family against these crisis events and the financial strain that can arise from them. Financial planning therefore needs to include insurance planning — an instrument for risk mitigation by transferring financial risk to financial institutions." },
  { id: "insplan", title: "1.6  Insurance Planning", body: "Risk management means transferring risk so that, should a trigger event occur to you or a family member, the resulting financial loss is covered. This includes:\n\n1. Income protection — to maintain your family's standard of living.\n2. Disability income — continuous income to reduce the burden on family.\n3. Medical insurance — covering medical expenses for the family, as well as income replacement in the case of a major illness or accident including hospitalisation expenses." },
  { id: "invplan", title: "1.7  Investment Planning", body: "While it is important to invest effectively for higher returns, it is even more important to preserve wealth through risk transfer. Many policyholders can direct a larger portion of premiums toward goal planning and retirement funds while also being protected under a life insurance policy.\n\nAn annual renewable term assurance incorporated into an investment-linked plan allows a policyholder to obtain necessary coverage at a premium normally lower than a level term plan. As the policyholder nears retirement age — when mortality charges increase significantly — coverage can be reduced, since accumulated investments should allow self-insuring a larger part of the original sum assured." },
];

const PLAN_LIBRARY = {
  GPP: { name: "Whole Life Critical Illness — Guaranteed Protect Plus", body: "Guaranteed Protect Plus is a limited-premium whole life policy providing protection against death up to age 100 and total & permanent disability up to age 70, with premium payment terms of 15 or 20 years (this proposal uses 20 years). It is a participating policy, allowing you to share in the performance of the participating fund through non-guaranteed bonuses.\n\n• Death Benefit — pays the Insured Amount plus bonuses, less amounts owing.\n• TPD Benefit — lump sum of the Insured Amount plus bonuses before age 70.\n• Minimum Death/Critical Illness Benefit — boosts coverage to 2× the insured amount up to age 65.\n• Maturity Benefit — lump sum of Insured Amount plus bonuses at age 100.\n• Bonuses — Reversionary Bonus and Terminal Bonus.\n• Option to Purchase Additional Insurance — buy new coverage without evidence of insurability on key life events (18th birthday, marriage, birth/adoption of a child, death of spouse).\n• Early Critical Protector Life (ECPL) — covers 150 medical conditions across severity stages (42 Early + 35 Intermediate + 73 Major), plus a Special Conditions benefit covering 15 conditions at 20% of the ECPL insured amount (max 5 claims).\n\nA win-win policy offering both protection and returns: a lump sum is available when there is a need to claim, easing financial burden if the unforeseen occurs, and a guaranteed surrender amount plus cash bonuses is available as a savings return (breakeven around year 25–30).\n\nPlan Limitations:\n∴ The 2× boosted coverage ends at the 65th birthday.\n∴ Once a critical illness claim is made, the plan terminates unless total insured amount (including booster) exceeds $250,000.\n∴ 90-day waiting period applies to most critical illnesses." },
  PA: { name: "Comprehensive Accident Coverage — Solitaire Personal Accident", body: "• Covers Death, Total Permanent Disability and dismemberment due to accident at a very low premium.\n• Covers broken bones and burns up to $8,000.\n• Provides stability of lifestyle in case of loss of income or unexpected expenses arising from accidental death or disability.\n\nPlan Limitations:\n∴ As a standalone accident plan, coverage is payable only upon accidental causes.\n∴ If nothing should happen, the plan does not provide any return." },
  MSCC: { name: "Comprehensive Cancer Coverage — MultiStage Cancer Cover", body: "• A critical illness plan specially designed to provide coverage for Major Cancer at early, intermediate and major stages.\n• Acts as income protection so you have funding to continue your standard of living upon diagnosis.\n• Level premium for 20 years.\n\nPlan Limitations:\n∴ Cancer benefit is payable only once; the policy terminates upon diagnosis of any covered stage resulting in payout.\n∴ As a standalone cancer plan, coverage is payable only upon diagnosis of Major Cancer.\n∴ If nothing should happen, the plan does not provide any return." },
  HI: { name: "Hospital Confinement Pay-Out — Hospital Income", body: "• Provides a cash payout for each day of hospital confinement (in Brunei Darussalam or overseas) due to injury or sickness.\n• Provides a get-well benefit after discharge.\n• Daily cash provision if required to undergo day surgery or recuperate as an outpatient following discharge.\n\nPlan Limitations:\n∴ As a standalone hospitalisation plan, coverage is payable only upon hospitalisation (admission to a hospital bed for at least 6 hours).\n∴ If nothing should happen, the plan does not provide any return." },
  STP: { name: "Income Protection — Secure Term Plus", body: "• A term coverage plan providing high insurance coverage against death, total permanent disability and terminal illness for relatively low premiums.\n• Premiums are level for the initial 5, 10 or 20 years (this proposal locks in 20 years).\n• Acts as income protection to maintain your standard of living, and as credit protection against any liabilities.\n• Critical illness coverage is optional.\n• Convertible to a whole life plan in the future regardless of medical condition at that time — conversion is based on your health condition as of now.\n\nPlan Limitations:\n∴ Premiums become higher after the initial level-premium period." },
  ILP: { name: "Investment with Unit Trusts — Optimizer", body: "Optimizer is a flexible investment-linked life insurance plan combining protection and investment to enhance returns for your goals while keeping income protection in place. Returns are not guaranteed, as they depend on market performance — a longer time horizon allows you to withstand investment fluctuations.\n\n• Vary your protection and investment mix without changing your premium.\n• Sum assured is flexible — increase or decrease within limits to match your protection needs.\n• Premiums convert to units invested in a choice of Asia Equity and Global Bond unit trusts.\n• Top-up available anytime (minimum $1,000) to increase portfolio returns.\n• Total payable upon death or permanent disability is the Sum Assured plus the present policy cash value.\n• Fixed minimum of 8 paying years — acts as a forced savings system; thereafter you may continue or stop payment depending on your needs.\n\nPlan Limitations:\n∴ Insurance charges increase with age, which may reduce future returns.\n∴ Regular premium is locked for 8 years — no withdrawal or surrender during this period.\n∴ Penalty charges apply for late premiums, early surrender or partial withdrawal before completing 8 paying years.\n∴ Returns are not guaranteed and vary directly with the investment climate." },
  ASCC: { name: "Comprehensive Critical Illness + Special Conditions — Absolute Critical Cover", body: "Absolute Critical Cover is a standalone regular premium, non-participating critical illness plan providing coverage against death, critical illnesses of different severities including Pre-Early conditions, and Special Conditions.\n\n• 187 total conditions covered — going beyond standard critical illness plans.\n• 150 Multi-Stage Critical Illnesses across Early Stage (42), Intermediate Stage (35) and Major Stage (73).\n• Pre-Early Benefit — 12 Pre-Early conditions (including severe hypertension, thyroid disorders, macular degeneration) trigger a payout of 10% of the insured amount or Maximum Claim Limit, up to the policy anniversary on or following age 85.\n• Special Conditions Benefit — 25 covered special conditions (including ADHD, ASD, diabetic complications, Kawasaki disease, osteoporosis, COPD, severe gout) pay 20% of the insured amount per condition. Maximum 10 claims; each condition claimable once; payments do not reduce the insured amount.\n• Safety Net Benefit — if admitted to ICU for at least 4 days, a one-time additional 20% of coverage amount is paid, covering all illnesses, injuries and conditions including future unknown diseases.\n• Power Reset — if the policy is in force 12 months after a claimed diagnosis, the Current Insured Amount is restored to 100%.\n• Power Relapse Benefit — if diagnosed with a Power Relapse Critical Illness (recurred heart attack, recurred stroke, re-diagnosed major cancer, repeated heart valve surgery, repeated major organ/bone marrow transplantation), 100% of the Current Insured Amount is paid out (200% total). 2-year waiting period applies.\n• Early Critical Protector Waiver of Premium — premiums are waived if diagnosed with a covered critical illness while the supplementary benefit is in force.\n• Payor Benefit (juvenile/child policy) — if the payor is diagnosed with Early, Intermediate or Major CI, dies, or becomes totally and permanently disabled, all future premiums are waived until end of premium term or insured's age 25, whichever is earlier.\n• Death Benefit — 5% of the Insured Amount paid upon death while policy is in force.\n• Surrender Benefit (Life Plan only) — after the 60th policy anniversary or insured's 75th birthday (whichever is earlier): 75% of insured amount less any CI benefits paid, plus an additional 1% per policy anniversary after the insured's 76th birthday.\n\nCoverage options: Value Plan to Age 65, Value Plan to Age 75, or Life Plan to Age 100.\n\nPlan Limitations:\n∴ No benefits for any CI stage or conditions within 90 days from date of issue or reinstatement.\n∴ Power Reset only applies after 1 year following claimed diagnosis.\n∴ Power Relapse Benefit has a 2-year waiting period.\n∴ Pre-Early Benefit covers only until policy anniversary on or immediately following insured's 85th birthday.\n∴ No surrender returns until 60th policy anniversary or 75th birthday.\n∴ No surrender returns if any CI benefit has been paid.\n∴ Child premium discount only until policy anniversary on or immediately following insured's 21st birthday." },
  RS: { name: "Guaranteed Annuity Income — Retirement Saver (IV)" , body: "Retirement Saver (IV) is an endowment annuity insurance policy designed to provide a guaranteed monthly stream of retirement income from your chosen Retirement Age, plus coverage against death. It is a participating policy with non-guaranteed dividends.\n\n• Choose Retirement Age of 55, 60 or 65; pay premiums as a single payment or until 5 years before Retirement Age; receive Retirement Income for a 15-year payout period.\n• Retirement Income — paid monthly over the selected payout period, starting one month after the policy anniversary following your Retirement Age.\n• Monthly Dividends — declared yearly and credited monthly; once credited, they form part of the guaranteed benefits. Withdraw them or leave to accumulate interest.\n• Terminal Dividend — non-guaranteed, payable upon claim, maturity or surrender.\n• Maturity Benefit — the final income payout plus accumulated dividends and rewards, after deducting amounts owing." },
};

const DEFAULT_PRODUCTS = [
  { key: "GPP", label: "Whole Life Critical Illness Coverage + 2x coverage before Age 65", category: "Risk Management", coverage: "$90,000 ($180,000)", monthly: 386.81, annual: 4446, returns: "Cash value: Age 65 $57,324 · Age 70 $76,484 · Age 83 $120,845", tier: "optional", include: false, planImages: [] },
  { key: "PA", label: "Comprehensive Accident Coverage", category: "Risk Management", coverage: "$100,000", monthly: 24.57, annual: 282.51, returns: "No returns", tier: "recommended", include: false, planImages: [] },
  { key: "MSCC", label: "Comprehensive Cancer Coverage", category: "Risk Management", coverage: "$100,000", monthly: 63.34, annual: 728, returns: "No returns", tier: "recommended", include: false, planImages: [] },
  { key: "ASCC", label: "Absolute Critical Cover — Value Plan (to Age 65)", category: "Risk Management", coverage: "$100,000", monthly: 0, annual: 0, returns: "No returns", tier: "recommended", include: false, insuredBy: "self", cciOption: "65", planImages: [] },
  { key: "ASCC", label: "Absolute Critical Cover — Value Plan (to Age 75)", category: "Risk Management", coverage: "$100,000", monthly: 0, annual: 0, returns: "No returns", tier: "recommended", include: false, insuredBy: "self", cciOption: "75", planImages: [] },
  { key: "ASCC", label: "Absolute Critical Cover — Life Plan (to Age 100)", category: "Risk Management", coverage: "$100,000", monthly: 0, annual: 0, returns: "", tier: "recommended", include: false, insuredBy: "self", cciOption: "100", planImages: [] },
  { key: "HI", label: "Daily Hospitalisation Income Pay-out" , category: "Risk Management", coverage: "$100/day", monthly: 25.6, annual: 294, returns: "No returns", tier: "recommended", include: false, planImages: [] },
  { key: "STP", label: "Income Protection: Death, Disability + Critical Illness", category: "Risk Management", coverage: "$500,000 / $120,000 CI", monthly: 106.79, annual: 1227.5, returns: "No returns", tier: "optional", include: false, planImages: [] },
  { key: "ILP", label: "Investment with Unit Trusts — Growth Fund", category: "Goal Planning", coverage: "$15,000 SA", monthly: 250, annual: 3000, returns: "Projection at 4–8%: Age 50 $35,300–45,700 · Age 60 $74,400–122,500 · Age 68 $113,500–228,100", tier: "future", include: false, planImages: [] },
  { key: "RS", label: "Guaranteed Annuity for Retirement (60–75) — $500/month", category: "Retirement Planning", coverage: "$500/month for 15 yrs", monthly: 327.99, annual: 3770, returns: "Capital $82,940 · Income $90,000 · Dividends $48,715 · Terminal $56,055", tier: "future", include: false, planImages: [] },
];

const TIER_META = {
  recommended: { label: "Recommended", note: "fits within the agreed budget", cls: "bg-blue-50 border-blue-300", chip: "bg-blue-600 text-white" },
  optional: { label: "Worth considering", note: "currently outside the specified budget", cls: "bg-amber-50 border-amber-300", chip: "bg-amber-500 text-white" },
  future: { label: "Future option", note: "to explore as finances allow or priorities evolve", cls: "bg-emerald-50 border-emerald-300", chip: "bg-emerald-600 text-white" },
};

const EXPENSE_GROUPS = [
  { id: "loans", label: "Loans / Big-Expense", items: [["carLoan","Car loan"],["mortgage","House / Mortgage"],["personalLoan","Personal loan"],["loanOther","Others"]] },
  { id: "expenditures", label: "Expenditures", items: [["transport","Transport"],["subscription","Subscription"],["wifiPhone","Wifi & phone"],["family","Family"],["children","Children"],["eatingOut","Eating out"],["travel","Travel / Luxury"],["sinking","Other sinking funds"]] },
  { id: "savings", label: "Savings / Investments", items: [["genSavings","General"],["emergency","Emergency funds"],["retirement","Retirement"],["investments","Investment(s)"]] },
  { id: "protection", label: "Protection", items: [["lifeCI","Life insurance (+ CI)"],["accHosp","Accident & hospital"],["term","Term"],["special","Special"]] },
];

const defaultExpenses = () => Object.fromEntries(
  EXPENSE_GROUPS.map(g => [g.id, g.items.map(([k, label]) => ({ id: uid(), label, amount: "", note: "" }))])
);

const blankClient = () => ({
  id: uid(),
  name: "", dob: "", occupation: "", occDetails: "", meetingDate: "", riskProfile: "",
  dependents: [],
  priorities: ["", "", "", "", ""],
  concernsNote: "",
  reportImages: [],
  income: { basic: "", bonuses: "", allowances: [], others: [], spkPct: "8.5" },
  expenses: defaultExpenses(),
  assets: {
    invested: [{ id: uid(), name: "SPK", current: "", future: "" }],
    liquid: [{ id: uid(), name: "Savings", amount: "" }, { id: uid(), name: "Fixed deposits", amount: "" }, { id: uid(), name: "Emergency", amount: "" }],
    personal: [{ id: uid(), name: "Personal", amount: "" }, { id: uid(), name: "Motor", amount: "" }, { id: uid(), name: "Property", amount: "" }],
  },
  liabilities: [{ id: uid(), name: "Car loan", amount: "" }, { id: uid(), name: "Housing loan", amount: "" }, { id: uid(), name: "Credit card", amount: "" }],
  incomeReplacement: { monthly: "5000", years: "20", covDeath: "", covMCI: "", covECI: "", covAccident: "" },
  retirement: { monthly: "5000", years: "20", yearsToRetire: "25", inflation: "2.5", spkProj: "", spkAnnuityMonthly: "", spkAnnuityYears: "15", pension: "", annuities: { current: "", contrib: "", rate: "", years: "" }, investments: { current: "", contrib: "", rate: "", years: "" } },
  otherObjectives: [],
  products: DEFAULT_PRODUCTS.map(p => ({ ...p, insuredBy: "self" })),
  budgetNote: "approximately $100 per month",
  narrative: { exec: "", recoIntro: "", actionPlan: "" },
  sections: { education: true, hierarchy: true, ratios: true, allocation: true },
  updated: Date.now(),
});

// upgrade clients saved under the previous data model
function migrate(c) {
  const b = blankClient();
  const m = { ...b, ...c };
  m.income = { ...b.income, ...(c.income || {}) };
  if (!Array.isArray(m.income.allowances)) {
    const v = num(m.income.allowances);
    m.income.allowances = v ? [{ id: uid(), note: "", amount: String(v) }] : [];
  }
  if (!Array.isArray(m.income.others)) {
    const v = num((c.income || {}).other);
    m.income.others = v ? [{ id: uid(), note: "", amount: String(v) }] : [];
  }
  if (m.income.bonuses == null) m.income.bonuses = "";
  m.retirement = { ...b.retirement, ...(c.retirement || {}) };
  const rt0 = c.retirement || {};
  if (rt0.spkAnnuity != null && m.retirement.spkAnnuityLegacy == null) m.retirement.spkAnnuityLegacy = String(rt0.spkAnnuity);
  if (typeof m.retirement.annuities !== "object" || m.retirement.annuities == null) m.retirement.annuities = { current: String(rt0.annuities || ""), contrib: "", rate: "", years: "" };
  if (typeof m.retirement.investments !== "object" || m.retirement.investments == null) m.retirement.investments = { current: String(rt0.investments || ""), contrib: "", rate: "", years: "" };
  if (!Array.isArray(m.otherObjectives)) m.otherObjectives = [];
  // Sync products: add any new DEFAULT_PRODUCTS entries missing from saved client
  const existingProds = Array.isArray(c.products) ? c.products : [];
  const mergedProds = DEFAULT_PRODUCTS.map(def => {
    // match by key + cciOption (for ASCC variants) or just key
    const saved = existingProds.find(p =>
      p.key === def.key && (def.cciOption ? p.cciOption === def.cciOption : !p.cciOption)
    );
    if (saved) {
      // preserve all saved fields but ensure new fields exist
      return { ...def, ...saved, planImages: saved.planImages || [], insuredBy: saved.insuredBy || "self" };
    }
    return { ...def }; // brand new product — add with defaults
  });
  m.products = mergedProds;
  const oldExp = c.expenses || {};
  if (!EXPENSE_GROUPS.every(g => Array.isArray(oldExp[g.id]))) {
    m.expenses = Object.fromEntries(EXPENSE_GROUPS.map(g => [g.id, g.items.map(([k, label]) => ({ id: uid(), label, amount: oldExp[k] != null ? String(oldExp[k]) : "", note: "" }))]));
  }
  const a = c.assets || {};
  m.assets = { ...b.assets, ...a };
  if (!Array.isArray(m.assets.liquid)) m.assets.liquid = [
    { id: uid(), name: "Savings", amount: a.savings || "" },
    { id: uid(), name: "Fixed deposits", amount: a.fixedDeposits || "" },
    { id: uid(), name: "Emergency", amount: a.emergencyCash || "" }];
  if (!Array.isArray(m.assets.personal)) m.assets.personal = [
    { id: uid(), name: "Personal", amount: a.personal || "" },
    { id: uid(), name: "Motor", amount: a.motor || "" },
    { id: uid(), name: "Property", amount: a.property || "" }];
  m.assets.invested = (m.assets.invested || []).map(r => ({ id: r.id || uid(), ...r }));
  if (!Array.isArray(c.liabilities)) {
    const l = c.liabilities || {};
    m.liabilities = [
      { id: uid(), name: "Car loan", amount: l.carLoan || "" },
      { id: uid(), name: "Housing loan", amount: l.housingLoan || "" },
      { id: uid(), name: "Credit card", amount: l.cc1 || "" }];
    if (num(l.cc2)) m.liabilities.push({ id: uid(), name: "Credit card 2", amount: String(l.cc2) });
    if (num(l.cc3)) m.liabilities.push({ id: uid(), name: "Credit card 3", amount: String(l.cc3) });
  }
  return m;
}

// ---------- storage ----------
const STORE_KEY = "arkan-clients-v1";
function loadClients() {
  try { const r = localStorage.getItem(STORE_KEY); const list = r ? JSON.parse(r) : []; return list.map(migrate); }
  catch { return []; }
}
function saveClients(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); return true; }
  catch (e) { console.error("save failed", e); return false; }
}

// ---------- derived figures ----------
// future value of a current amount + fixed monthly contribution, at r% p.a. over n years
function projectFV(o, fallbackYears) {
  const cur = num(o.current), annContrib = num(o.contrib) * 12, r = num(o.rate) / 100;
  const n = num(o.years) || num(fallbackYears) || 0;
  const growth = Math.pow(1 + r, n);
  return cur * growth + (r > 0 ? annContrib * ((growth - 1) / r) : annContrib * n);
}

function compute(c) {
  const allowTotal = (c.income.allowances || []).reduce((s, a) => s + num(a.amount), 0);
  const othersTotal = (c.income.others || []).reduce((s, a) => s + num(a.amount), 0);
  const bonusMonthly = num(c.income.bonuses) / 12;
  const gross = num(c.income.basic) + allowTotal + othersTotal + bonusMonthly;
  const spk = num(c.income.basic) * num(c.income.spkPct) / 100;
  const net = gross - spk;
  const groupTotals = {};
  let totalExpenses = 0;
  EXPENSE_GROUPS.forEach(g => {
    const t = (c.expenses[g.id] || []).reduce((s, row) => s + num(row.amount), 0);
    groupTotals[g.id] = t; totalExpenses += t;
  });
  const surplus = net - totalExpenses;
  const invested = c.assets.invested.reduce((s, a) => s + num(a.current), 0);
  const investedFuture = c.assets.invested.reduce((s, a) => s + num(a.future), 0);
  const cash = (c.assets.liquid || []).reduce((s, a) => s + num(a.amount), 0);
  const personal = (c.assets.personal || []).reduce((s, a) => s + num(a.amount), 0);
  const totalAssets = invested + cash + personal;
  const totalLiab = (c.liabilities || []).reduce((s, l) => s + num(l.amount), 0);
  const netWorth = totalAssets - totalLiab;
  const monthlyDebt = groupTotals.loans;
  const ratios = [
    { id: "liquidity", name: "Basic Liquidity (months)", value: totalExpenses > 0 ? cash / totalExpenses : null, target: 6, dir: ">=", fmtV: v => fmt(v, 1) + " mo",
      desc: "Cash & cash equivalents ÷ monthly expenses — the number of months you can sustain expenses if income is lost. Recommended: at least 6 months." },
    { id: "liqNW", name: "Liquid Assets to Net Worth", value: netWorth > 0 ? cash / netWorth : null, target: 0.15, dir: ">=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Cash & cash equivalents ÷ net worth — how accessible your net worth is for short-term cash needs. Recommended: at least 15%." },
    { id: "savings", name: "Savings Ratio", value: net > 0 ? groupTotals.savings / net : null, target: 0.2, dir: ">=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Savings ÷ monthly take-home income. Recommended: save at least 20% of income toward future financial needs." },
    { id: "debtAsset", name: "Debt to Assets", value: totalAssets > 0 ? totalLiab / totalAssets : null, target: 0.5, dir: "<=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Total liabilities ÷ total assets — how much of your assets remain mortgaged to financial institutions. Recommended: below 50%." },
    { id: "debtService", name: "Debt Service Ratio", value: net > 0 ? monthlyDebt / net : null, target: 0.35, dir: "<=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Monthly debt repayments ÷ take-home income — your ability to service debt. Recommended: below 35%." },
    { id: "investNW", name: "Invested Assets to Net Worth", value: netWorth > 0 ? invested / netWorth : null, target: 0.5, dir: ">=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Invested assets ÷ net worth — how much of your assets are working for you. Ideally 50% or above." },
  ].map(r => ({ ...r, pass: r.value == null ? null : (r.dir === ">=" ? r.value >= r.target : r.value <= r.target) }));
  // 4-3-2-1
  const alloc = [
    ["Loans / big purchases", 0.4, groupTotals.loans],
    ["Expenditures", 0.3, groupTotals.expenditures],
    ["Savings", 0.2, groupTotals.savings],
    ["Protection", 0.1, groupTotals.protection],
  ].map(([label, pct, cur]) => ({ label, pct, optimal: net * pct, current: cur, curPct: net > 0 ? cur / net : 0 }));
  // emergency fund
  const ef3 = totalExpenses * 3, ef6 = totalExpenses * 6;
  // income replacement
  const ir = c.incomeReplacement;
  const irMonthly = num(ir.monthly), irYears = num(ir.years);
  const potentialIncome = irMonthly * 12 * irYears;
  const irRows = [
    { name: "Death / TPD (10 years)", guideline: "10 years of income", bench: irMonthly * 12 * 10, current: num(ir.covDeath) },
    { name: "Death / TPD (20 years)", guideline: "20 years of income", bench: irMonthly * 12 * 20, current: num(ir.covDeath) },
    { name: "Major Critical Illness", guideline: "5 years of income", bench: irMonthly * 12 * 5, current: num(ir.covMCI) },
    { name: "Early Critical Illness", guideline: "3 years of income", bench: irMonthly * 12 * 3, current: num(ir.covECI) },
    { name: "Accident", guideline: "Inpatient & outpatient, reimbursement", bench: 100000, current: num(ir.covAccident) },
  ].map(r => ({ ...r, shortfall: Math.max(0, r.bench - r.current) }));
  // retirement
  const rt = c.retirement;
  const rtRequired = num(rt.monthly) * 12 * num(rt.years);
  const rtAdjusted = rtRequired * Math.pow(1 + num(rt.inflation) / 100, num(rt.yearsToRetire));
  const spkAnnuityTotal = num(rt.spkAnnuityMonthly) > 0 ? num(rt.spkAnnuityMonthly) * 12 * num(rt.spkAnnuityYears) : num(rt.spkAnnuityLegacy);
  const annTotal = projectFV(rt.annuities || {}, rt.yearsToRetire);
  const invTotal = projectFV(rt.investments || {}, rt.yearsToRetire);
  const rtProjected = num(rt.spkProj) + spkAnnuityTotal + num(rt.pension) + annTotal + invTotal;
  const rtShortfall = Math.max(0, rtAdjusted - rtProjected);
  const rtMonthlyAnnuity = num(rt.years) > 0 ? rtProjected / (num(rt.years) * 12) : 0;
  // products
  const selected = c.products.filter(p => p.include);
  const premMonthly = selected.reduce((s, p) => s + num(p.monthly), 0);
  const premAnnual = selected.reduce((s, p) => s + num(p.annual), 0);
  const assetPie = [
    { name: "Invested assets", value: invested },
    { name: "Cash & equivalents", value: cash },
    { name: "Personal items", value: personal },
  ].filter(x => x.value > 0);
  const ratioBars = ratios.filter(r => r.value != null && r.id !== "liquidity").map(r => ({
    name: r.name, shortName: r.name.replace(/ \(.*\)/, "").replace("Invested Assets to Net Worth", "Invested/NW").replace("Liquid Assets to Net Worth", "Liquid/NW").replace("Basic ", ""),
    yours: r.value, value: r.value, target: r.target, pct: r.id === "liquidity" ? null : true,
    pass: r.pass, dir: r.dir,
    displayYours: r.id === "liquidity" ? r.value : r.value * 100,
    displayTarget: r.id === "liquidity" ? r.target : r.target * 100,
    unit: r.id === "liquidity" ? "mo" : "%",
    yoursLabel: r.fmtV(r.value),
  }));
  const pie = [
    { name: "Loans / big purchases", value: groupTotals.loans },
    { name: "Expenditures", value: groupTotals.expenditures },
    { name: "Savings / investments", value: groupTotals.savings },
    { name: "Protection", value: groupTotals.protection },
    { name: "Unallocated (surplus)", value: Math.max(0, surplus) },
  ].filter(x => x.value > 0);
  return { gross, spk, net, groupTotals, totalExpenses, surplus, invested, investedFuture, cash, personal,
    totalAssets, totalLiab, netWorth, monthlyDebt, ratios, alloc, ef3, ef6, pie, assetPie, ratioBars,
    potentialIncome, irRows, rtRequired, rtAdjusted, rtProjected, rtShortfall, rtMonthlyAnnuity, spkAnnuityTotal, annTotal, invTotal, selected, premMonthly, premAnnual };
}

// ---------- AI drafting ----------
async function draftNarrative(c, d) {
  const failing = d.ratios.filter(r => r.pass === false).map(r => r.name);
  const payload = {
    clientFirstName: (c.name || "the client").split(" ")[0],
    age: calcAge(c.dob) || null,
    occupation: c.occupation, occupationDetails: c.occDetails,
    meetingDate: c.meetingDate, riskProfile: c.riskProfile,
    priorities: c.priorities.filter(Boolean),
    advisorNotesOnConcerns: c.concernsNote,
    monthlyNetIncome: d.net, monthlyExpenses: d.totalExpenses, monthlySurplus: d.surplus,
    netWorth: d.netWorth, cashAndEquivalents: d.cash, investedAssets: d.invested, totalLiabilities: d.totalLiab,
    emergencyFundTarget3mo: d.ef3, emergencyFundCurrent: d.cash,
    ratiosBelowBenchmark: failing,
    protectionShortfalls: d.irRows.map(r => ({ need: r.name, benchmark: r.bench, current: r.current, shortfall: r.shortfall })),
    retirement: { requiredInflationAdjusted: Math.round(d.rtAdjusted), projected: d.rtProjected, shortfall: Math.round(d.rtShortfall), expectedMonthlyAnnuity: Math.round(d.rtMonthlyAnnuity) },
    recommendedPlans: d.selected.map(p => ({ plan: p.label, tier: p.tier, coverage: p.coverage, monthlyPremium: p.monthly })),
    otherObjectives: (c.otherObjectives || []).filter(o => o.name).map(o => ({ objective: o.name, target: num(o.target), years: num(o.years), note: o.note })),
    monthlyBudgetIndicated: c.budgetNote,
  };
  const prompt = `You are drafting sections of a financial planning recommendation report for a Certified Financial Planner in Brunei working under GoodLife Financial Planning (in association with AIA Brunei), with an advisory approach built on stewardship, trust, and reducing financial anxiety. Tone: warm, professional, plain-spoken, client-centred, never salesy or alarmist. Address the client as "you". Use the data below. Amounts are in BND ($).

CLIENT DATA:
${JSON.stringify(payload, null, 1)}

Write three sections:
1. "exec" — Executive Summary (3-4 short paragraphs): reference the meeting date if given, summarise the client's situation, priorities and key vulnerabilities identified, and close with a sentence framing financial planning as meeting life goals through proper management of finances.
2. "recoIntro" — Recommendation narrative (3-5 paragraphs): cover budgeting/financial standing, emergency funds (state whether current funds are sufficient against the 3-month target), risk management gaps, and long-term/retirement planning. Be specific with the numbers provided.
3. "actionPlan" — A numbered action plan (3-5 items) as a single string, each item starting "1. ", "2. " etc. on its own paragraph, each with a bold-worthy title followed by a colon then 2-3 sentences, prioritised to the client's situation and the recommended plans.

Respond ONLY with valid JSON, no markdown fences, no preamble: {"exec": "...", "recoIntro": "...", "actionPlan": "..."}`;
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
  if (!apiKey) throw new Error("Add VITE_ANTHROPIC_API_KEY to your Lovable project environment variables to enable AI drafting.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-iab": "allow" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!response.ok) {
    let detail = "";
    try { detail = JSON.stringify(await response.json()); } catch (_) { detail = await response.text().catch(() => ""); }
    throw new Error("The drafting service returned an error (HTTP " + response.status + "). " + detail);
  }
  const data = await response.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  if (!text.trim()) throw new Error("The drafting service returned an empty response. Please try again.");
  // robust JSON extraction: strip fences, then grab the outermost {...}
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = clean.indexOf("{"), last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1) clean = clean.slice(first, last + 1);
  try {
    const parsed = JSON.parse(clean);
    return { exec: parsed.exec || "", recoIntro: parsed.recoIntro || "", actionPlan: parsed.actionPlan || "" };
  } catch (_) {
    throw new Error("Couldn't read the drafted text (the response may have been cut off). Please try again.");
  }
}

function buildClaudePrompt(c, d) {
  const failing = d.ratios.filter(r => r.pass === false).map(r => r.name);
  const lines = [
    `You are drafting sections of a financial planning recommendation report for a Certified Financial Planner in Brunei working under GoodLife Financial Planning (in association with AIA Brunei), with an advisory approach built on stewardship, trust, and reducing financial anxiety. Tone: warm, professional, plain-spoken, client-centred, never salesy or alarmist. Address the client as "you". Use the data below. Amounts are in BND ($).`,
    ``,
    `CLIENT DATA:`,
    `- Name: ${c.name || "Client"}`,
    `- Age: ${calcAge(c.dob) || "Not provided"}`,
    `- Occupation: ${c.occupation || "Not provided"}${c.occDetails ? " (" + c.occDetails + ")" : ""}`,
    `- Risk profile: ${c.riskProfile || "Not provided"}`,
    `- Meeting date: ${c.meetingDate || "Not provided"}`,
    `- Monthly net income: ${money(d.net, 0)}`,
    `- Monthly expenses: ${money(d.totalExpenses, 0)}`,
    `- Monthly surplus: ${money(d.surplus, 0)}`,
    `- Net worth: ${money(d.netWorth, 0)}`,
    `- Cash & equivalents: ${money(d.cash, 0)}`,
    `- Invested assets: ${money(d.invested, 0)}`,
    `- Total liabilities: ${money(d.totalLiab, 0)}`,
    `- Emergency fund target (3 months): ${money(d.ef3, 0)}`,
    `- Emergency fund current: ${money(d.cash, 0)}`,
    `- Ratios below benchmark: ${failing.length ? failing.join(", ") : "None"}`,
    `- Protection shortfalls:`,
    ...d.irRows.map(r => `  • ${r.name}: benchmark ${money(r.bench, 0)}, current ${money(r.current, 0)}, shortfall ${money(r.shortfall, 0)}`),
    `- Retirement:`,
    `  • Required (inflation-adjusted): ${money(Math.round(d.rtAdjusted), 0)}`,
    `  • Projected: ${money(d.rtProjected, 0)}`,
    `  • Shortfall: ${money(Math.round(d.rtShortfall), 0)}`,
    `  • Expected monthly annuity: ${money(Math.round(d.rtMonthlyAnnuity), 0)}`,
    `- Recommended plans:`,
    ...d.selected.map(p => `  • ${p.label} — coverage: ${p.coverage}, monthly premium: ${money(p.monthly, 0)}`),
    `- Other objectives:`,
    ...(c.otherObjectives || []).filter(o => o.name).length
      ? (c.otherObjectives || []).filter(o => o.name).map(o => `  • ${o.name}: target ${money(num(o.target), 0)}, ${num(o.years)} years — ${o.note || ""}`)
      : [`  None`],
    `- Advisor concern notes: ${c.concernsNote || "None"}`,
    `- Priorities: ${c.priorities.filter(Boolean).join("; ") || "None"}`,
    `- Monthly budget indicated: ${c.budgetNote || "Not specified"}`,
    ``,
    `Write three sections:`,
    `1. "exec" — Executive Summary (3-4 short paragraphs): reference the meeting date if given, summarise the client's situation, priorities and key vulnerabilities identified, and close with a sentence framing financial planning as meeting life goals through proper management of finances.`,
    `2. "recoIntro" — Recommendation narrative (3-5 paragraphs): cover budgeting/financial standing, emergency funds (state whether current funds are sufficient against the 3-month target), risk management gaps, and long-term/retirement planning. Be specific with the numbers provided.`,
    `3. "actionPlan" — A numbered action plan (3-5 items) as a single string, each item starting "1. ", "2. " etc. on its own paragraph, each with a bold-worthy title followed by a colon then 2-3 sentences, prioritised to the client's situation and the recommended plans.`,
    ``,
    `Respond ONLY with a valid JSON object (no markdown fences, no preamble) in this exact shape:`,
    `{"exec": "...", "recoIntro": "...", "actionPlan": "..."}`
  ];
  return lines.join("\n");
}

// ---------- small UI atoms ----------
const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
  </label>
);
const Input = (props) => (
  <input {...props} className={"w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white " + (props.className || "")} />
);
const NumInput = (props) => <Input type="number" inputMode="decimal" step="any" {...props} />;
const TextArea = (props) => (
  <textarea {...props} className={"w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 bg-white " + (props.className || "")} />
);
const SectionCard = ({ title, children, right }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-serif text-lg text-purple-900">{title}</h3>
      {right}
    </div>
    {children}
  </div>
);
const PIE_COLORS = {
  "Loans / big purchases": "#3a1955",
  "Expenditures": "#7613ad",
  "Savings / investments": "#c026a3",
  "Protection": "#66229d",
  "Unallocated (surplus)": "#cbd5e1",
};

const ASSET_COLORS = { "Invested assets": "#51037c", "Cash & equivalents": "#9333ea", "Personal items": "#a78bca" };

const AllocationPie = ({ data, height = 300 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="38%" outerRadius="70%" paddingAngle={2}>
          {data.map((e, i) => <Cell key={i} fill={PIE_COLORS[e.name] || "#94a3b8"} />)}
        </Pie>
        <Tooltip formatter={(v) => money(v, 2)} />
        <Legend verticalAlign="bottom" height={48} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

const AssetPie = ({ data, height = 280 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="40%" outerRadius="72%" paddingAngle={2}>
          {data.map((e, i) => <Cell key={i} fill={ASSET_COLORS[e.name] || "#94a3b8"} />)}
        </Pie>
        <Tooltip formatter={(v) => money(v, 2)} />
        <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

const RatioBars = ({ data, height = 320 }) => (
  <div style={{ width: "100%", height }}>
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: 4 }}>
        <XAxis dataKey="shortName" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={56} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip formatter={(v, n) => [fmt(v, 1) + (data[0] && data[0].unit === "mo" ? "" : ""), n]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="displayTarget" name="Benchmark" fill="#cbd5e1" radius={[3,3,0,0]} />
        <Bar dataKey="displayYours" name="Yours" radius={[3,3,0,0]}>
          {data.map((e, i) => <Cell key={i} fill={e.pass ? "#7613ad" : "#dc2626"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

// Print-safe static SVG charts (used in the report; recharts ResponsiveContainer renders blank when printed)
const StaticDonut = ({ data, colorMap, size = 200 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.38, rin = size * 0.22;
  let acc = 0;
  const arc = (val) => {
    const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2; acc += val;
    const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, rin), [x3, y3] = p(a0, rin);
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rin} ${rin} 0 ${large} 0 ${x3} ${y3} Z`;
  };
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => <path key={i} d={arc(d.value)} fill={colorMap[d.name] || "#94a3b8"} stroke="#fff" strokeWidth="1.5" />)}
      </svg>
      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: colorMap[d.name] || "#94a3b8", display: "inline-block" }} />
            <span>{d.name}</span><b style={{ marginLeft: 4 }}>{money(d.value)}</b>
            <span style={{ color: "#64748b" }}>({fmt((d.value / total) * 100, 0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const StaticRatioBars = ({ data }) => {
  if (!data.length) return null;
  // Vertical grouped bar chart — benchmark (grey) + yours (brand/red), capped at 100%
  const nGroups = data.length;
  const groupW = 72, gutter = 16, barW = 22, gap = 4;
  const chartW = nGroups * (groupW + gutter) + gutter;
  const chartH = 180, labelH = 48, axisW = 32, legendH = 28;
  const totalW = axisW + chartW;
  const totalH = chartH + labelH + legendH + 20;
  const CAP = 100;
  const yScale = v => chartH - Math.min(CAP, Math.max(0, v)) / CAP * chartH;
  // Y axis lines
  const yLines = [0, 25, 50, 75, 100].map(pct => ({
    y: yScale(pct), label: pct + "%"
  }));
  return (
    <svg width="100%" viewBox={`0 0 ${totalW} ${totalH}`} style={{ maxWidth: totalW, fontFamily: "inherit" }}>
      {/* Y axis lines & labels */}
      {yLines.map(({y, label}) => (
        <g key={label}>
          <line x1={axisW} y1={y + 4} x2={totalW} y2={y + 4} stroke="#e2e8f0" strokeWidth="1" />
          <text x={axisW - 4} y={y + 8} fontSize="8" textAnchor="end" fill="#94a3b8">{label}</text>
        </g>
      ))}
      {/* Groups */}
      {data.map((d, i) => {
        const benchVal = d.id === "liquidity" ? Math.min(CAP, (d.target / 12) * 100) : Math.min(CAP, d.target * 100);
        const yoursRaw = d.id === "liquidity" ? (d.value / 12) * 100 : d.value * 100;
        const yoursVal = Math.min(CAP, Math.max(0, yoursRaw));
        const x0 = axisW + gutter + i * (groupW + gutter);
        const benchH = chartH - yScale(benchVal);
        const yoursH = Math.max(2, chartH - yScale(yoursVal));
        const benchY = yScale(benchVal) + 4;
        const yoursY = yScale(yoursVal) + 4;
        const barColor = d.pass ? "#7613ad" : "#dc2626";
        const labelY = chartH + labelH + 4;
        return (
          <g key={i}>
            {/* Benchmark bar */}
            <rect x={x0} y={benchY} width={barW} height={benchH} fill="#cbd5e1" rx="2" />
            {/* Yours bar */}
            <rect x={x0 + barW + gap} y={yoursY} width={barW} height={yoursH} fill={barColor} rx="2" />
            {/* Value label above yours bar */}
            <text x={x0 + barW + gap + barW / 2} y={yoursY - 3} fontSize="8" textAnchor="middle" fill={barColor} fontWeight="600">{d.yoursLabel}</text>
            {/* Group label */}
            <foreignObject x={x0 - 4} y={chartH + 10} width={groupW + 8} height={labelH - 6}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{fontSize:8.5,textAlign:"center",color: d.pass ? "#475569" : "#b91c1c",lineHeight:1.3,wordBreak:"break-word"}}>
                {d.shortName} {d.pass ? "✓" : "⚠"}
              </div>
            </foreignObject>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={axisW} y={totalH - legendH + 4} width={12} height={10} fill="#cbd5e1" rx="2" />
      <text x={axisW + 16} y={totalH - legendH + 13} fontSize="9" fill="#64748b">Benchmark</text>
      <rect x={axisW + 100} y={totalH - legendH + 4} width={12} height={10} fill="#7613ad" rx="2" />
      <text x={axisW + 116} y={totalH - legendH + 13} fontSize="9" fill="#64748b">Yours (healthy)</text>
      <rect x={axisW + 230} y={totalH - legendH + 4} width={12} height={10} fill="#dc2626" rx="2" />
      <text x={axisW + 246} y={totalH - legendH + 13} fontSize="9" fill="#64748b">Needs attention</text>
    </svg>
  );
};

const MoneyRows = ({ rows, onChange, namePlaceholder }) => (
  <div className="space-y-2">
    {rows.map((r, i) => (
      <div key={r.id || i} className="grid grid-cols-12 gap-2">
        <div className="col-span-7"><Input value={r.name} onChange={e => { const l = [...rows]; l[i] = { ...r, name: e.target.value }; onChange(l); }} placeholder={namePlaceholder} /></div>
        <div className="col-span-4"><NumInput value={r.amount} onChange={e => { const l = [...rows]; l[i] = { ...r, amount: e.target.value }; onChange(l); }} placeholder="$" /></div>
        <div className="col-span-1 flex items-center"><button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-red-500 text-sm">✕</button></div>
      </div>
    ))}
  </div>
);

const NoteAmountRows = ({ rows, onChange, notePlaceholder }) => (
  <div className="space-y-2">
    {rows.map((r, i) => (
      <div key={r.id || i} className="grid grid-cols-12 gap-2 items-center">
        <div className="col-span-6"><Input value={r.note} onChange={e => { const l = [...rows]; l[i] = { ...r, note: e.target.value }; onChange(l); }} placeholder={notePlaceholder} /></div>
        <div className="col-span-3"><NumInput value={r.amount} onChange={e => { const l = [...rows]; l[i] = { ...r, amount: e.target.value }; onChange(l); }} placeholder="$/mo" /></div>
        <div className="col-span-2 text-right text-xs text-slate-500 tabular-nums">{money(num(r.amount) * 12)}/yr</div>
        <div className="col-span-1 flex items-center"><button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-red-500 text-sm">✕</button></div>
      </div>
    ))}
  </div>
);

const OBJECTIVE_PRESETS = ["Children's savings", "Hajj / Umrah", "House purchase", "Education fund", "Travel", "Wedding"];

const Stat = ({ label, value, accent, gold }) => (
  <div className={"rounded-lg px-4 py-3 " + (accent ? "bg-purple-900 text-white" : gold ? "bg-amber-100 border border-amber-400" : "bg-slate-50 border border-slate-200")}>
    <div className={"text-xs uppercase tracking-wide " + (accent ? "text-purple-200" : gold ? "text-amber-700" : "text-slate-500")}>{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
  </div>
);

// ---------- main app ----------
const STEPS = ["Profile", "Income Allocation", "Assets & Liabilities", "Objectives", "Plans", "Narrative"];

export default function App() {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("list"); // list | edit | report
  const [step, setStep] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [privacy, setPrivacy] = useState(true);

  useEffect(() => {
    try { setClients(loadClients()); } catch(_){} setLoaded(true);
    try { const r = localStorage.getItem(PRIV_KEY); if (r !== null) setPrivacy(r !== "0"); } catch(_) {}
  }, []);

  const togglePrivacy = () => {
    const next = !privacy; setPrivacy(next);
    try { localStorage.setItem(PRIV_KEY, next ? "1" : "0"); } catch(_) {}
  };
  const displayName = (name, fallback) => (privacy ? (initials(name) || fallback) : (name || fallback));

  const client = clients.find(c => c.id === activeId) || null;
  const d = useMemo(() => client ? compute(client) : null, [client]);

  const update = (patch) => {
    setClients(prev => {
      const next = prev.map(c => c.id === activeId ? { ...c, ...patch, updated: Date.now() } : c);
      saveClients(next);
      return next;
    });
  };
  const updateDeep = (key, patch) => update({ [key]: { ...client[key], ...patch } });

  const persist = () => {
    setSaveState("saving");
    const ok = saveClients(clients);
    setSaveState(ok ? "saved" : "error");
    setTimeout(() => setSaveState(""), 2000);
  };

  const newClient = () => {
    const c = blankClient();
    setClients(prev => {
      const next = [c, ...prev]; saveClients(next); return next;
    });
    setActiveId(c.id); setView("edit"); setStep(0);
  };
  const removeClient = (id) => {
    const next = clients.filter(c => c.id !== id);
    setClients(next); saveClients(next);
    if (activeId === id) { setActiveId(null); setView("list"); }
  };

  const runDraft = async () => {
    setDrafting(true);
    try {
      const out = await draftNarrative(client, d);
      updateDeep("narrative", { exec: out.exec || "", recoIntro: out.recoIntro || "", actionPlan: out.actionPlan || "" });
    } catch (e) {
      console.error(e);
      const msg = (e && e.message) ? e.message : String(e);
      alert("Drafting didn't complete.\n\n" + msg + "\n\nTip: open the app in full screen (tap the expand icon), then try again. The drafting feature needs an internet connection.");
    }
    setDrafting(false);
  };

  const copyPrompt = async () => {
    if (!client || !d) return;
    const prompt = buildClaudePrompt(client, d);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied! Paste it into Claude.ai");
    } catch (e) {
      toast.error("Could not copy to clipboard");
    }
  };

  const [showPrintModal, setShowPrintModal] = useState(false);
  const doPrint = () => { setShowPrintModal(true); };

  const doDownloadHTML = () => {
    const reportEl = document.getElementById("report-content");
    if (!reportEl) { alert("Preview the report first, then download."); return; }
    const styleText = Array.from(document.querySelectorAll("style")).map(s => s.innerHTML).join("\n");
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>GoodLife Report</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#f1f5f9;font-family:'Source Sans 3',system-ui,sans-serif}
${styleText}
@media print{
  body{background:#fff!important}
  @page{size:A4;margin:0}
  .no-print{display:none!important}
  .sheet{box-shadow:none!important;margin:0!important;max-width:100%!important;padding:14mm 16mm!important}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
</style></head><body>
<div class="no-print" style="background:linear-gradient(120deg,#3a1955,#51037c);color:#fff;padding:12px 24px;display:flex;justify-content:space-between;align-items:center;font-family:inherit;position:sticky;top:0;z-index:10">
  <span style="font-size:14px;opacity:.85">Open in browser &#8594; press &#8984;+P or Ctrl+P &#8594; Save as PDF</span>
  <button onclick="window.print()" style="background:#fff;color:#51037c;border:none;border-radius:8px;padding:8px 18px;font-weight:700;cursor:pointer;font-size:14px">&#x1F5A8; Print / Save as PDF</button>
</div>
<div style="background:#f1f5f9;min-height:100vh">\${reportEl.outerHTML}</div>
</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "GoodLife-Report.html";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doDownloadDocx = async () => {
    try {
      await generateDocx({ client, d, planLibrary: PLAN_LIBRARY, tierMeta: TIER_META, logoUrl: LOGO });
    } catch (e) {
      console.error(e);
      alert("Could not generate the Word document.\n\n" + (e?.message || e));
    }
  };

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;

  // ----- client list -----
  if (view === "list" || !client) return (
    <div className="min-h-screen bg-slate-100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap'); .font-serif{font-family:'Cormorant Garamond',Georgia,serif}.font-sans,body{font-family:'Source Sans 3',system-ui,sans-serif}`}</style>
      <header className="text-white" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 55%, #66229d 100%)" }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="bg-white/95 rounded-xl inline-block px-4 py-2 mb-2 shadow-sm"><img src={LOGO} alt="GoodLife Financial Planning" style={{ height: 42 }} /></div>
          <div className="text-xs uppercase tracking-[0.25em] text-purple-200 mb-4">Affiliated with Nancy Group</div>
          <h1 className="font-serif text-3xl">Recommendation Report Studio</h1>
          <p className="text-purple-200 text-sm mt-1">Capture the facts, weigh the numbers, and deliver a report worthy of the trust placed in you.</p>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl text-purple-900">Clients</h2>
          <div className="flex items-center gap-2">
            <button onClick={togglePrivacy} title={privacy ? "Showing initials only — tap to show full names" : "Showing full names — tap to show initials only"} className={"text-sm px-3 py-2 rounded-lg border " + (privacy ? "bg-purple-900 text-white border-purple-900" : "border-slate-300 text-slate-600 hover:bg-slate-50 bg-white")}>
              {privacy ? "🔒 Initials only" : "👁 Full names"}
            </button>
            <button onClick={newClient} className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ New client</button>
          </div>
        </div>
        {clients.length === 0 && (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500">
            No clients yet. Start a new client to begin the fact-find.
          </div>
        )}
        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">{displayName(c.name, "Unnamed client")}</div>
                <div className="text-xs text-slate-400">Updated {new Date(c.updated).toLocaleDateString("en-GB")} · {c.occupation || "—"}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setActiveId(c.id); setView("edit"); setStep(0); }} className="text-sm px-3 py-1.5 rounded-lg border border-purple-700 text-purple-800 hover:bg-purple-50">Open</button>
                <button onClick={() => { setActiveId(c.id); setView("report"); }} className="text-sm px-3 py-1.5 rounded-lg bg-purple-700 text-white hover:bg-purple-800">Report</button>
                <button onClick={() => { if (confirm("Delete " + displayName(c.name, "this client") + "?")) removeClient(c.id); }} className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-8">Client data is saved privately to your account in this app. Remember your confidentiality obligations when handling client information.</p>
      </main>
    </div>
  );

  // ----- report view -----
  if (view === "report") {
    const n = client.narrative;
    const para = (t) => (t || "").split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i} style={{textAlign:"justify",lineHeight:1.65,marginBottom:12,whiteSpace:"pre-line"}}>{p}</p>);

  // Smart plan body renderer — justified, highlighted, structured
  const renderPlanBody = (body) => {
    if (!body) return null;
    const lines = body.split("\n").filter(l => l.trim());
    const elements = [];
    let bulletGroup = [], limitGroup = [];
    const flushBullets = () => {
      if (!bulletGroup.length) return;
      elements.push(
        <ul key={"ul" + elements.length} className="mb-4 space-y-2">
          {bulletGroup.map((line, i) => {
            const text = line.replace(/^•\s*/, "");
            // Feature name is text before " — " or ":"
            const dashIdx = text.indexOf(" — ");
            const colonIdx = text.indexOf(": ");
            const splitAt = dashIdx !== -1 ? dashIdx : (colonIdx !== -1 && colonIdx < 50 ? colonIdx : -1);
            if (splitAt !== -1) {
              const feature = text.slice(0, splitAt);
              const desc = text.slice(splitAt + (dashIdx !== -1 ? 3 : 2));
              return (
                <li key={i} style={{ textAlign: "justify", lineHeight: 1.6, paddingLeft: 16, position: "relative", fontSize: 13 }}>
                  <span style={{ position: "absolute", left: 0, color: "#66229d", fontWeight: 700 }}>•</span>
                  <span style={{ color: "#3a1955", fontWeight: 700 }}>{feature}</span>
                  <span style={{ color: "#475569" }}>{dashIdx !== -1 ? " — " : ": "}{desc}</span>
                </li>
              );
            }
            return (
              <li key={i} style={{ textAlign: "justify", lineHeight: 1.6, paddingLeft: 16, position: "relative", fontSize: 13 }}>
                <span style={{ position: "absolute", left: 0, color: "#66229d", fontWeight: 700 }}>•</span>
                <span style={{ color: "#1f2937" }}>{text}</span>
              </li>
            );
          })}
        </ul>
      );
      bulletGroup = [];
    };
    const flushLimits = () => {
      if (!limitGroup.length) return;
      elements.push(
        <div key={"lim" + elements.length} className="mt-3 mb-3 rounded-lg border border-red-100 bg-red-50 p-3">
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#991b1b", marginBottom: 6 }}>Plan Limitations</div>
          <ul className="space-y-1">
            {limitGroup.map((line, i) => (
              <li key={i} style={{ textAlign: "justify", lineHeight: 1.55, paddingLeft: 16, position: "relative", fontSize: 12.5, color: "#7f1d1d" }}>
                <span style={{ position: "absolute", left: 0 }}>∴</span>
                <span>{line.replace(/^∴\s*/, "")}</span>
              </li>
            ))}
          </ul>
        </div>
      );
      limitGroup = [];
    };
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("∴")) {
        flushBullets();
        if (trimmed === "Plan Limitations:" || trimmed === "Plan Limitation:") return; // header row, skip
        limitGroup.push(trimmed);
      } else if (trimmed.startsWith("•")) {
        flushLimits();
        bulletGroup.push(trimmed);
      } else if (trimmed === "Plan Limitations:" || trimmed === "Plan Limitation:") {
        flushBullets();
        // skip header, next lines will be ∴
      } else {
        flushBullets(); flushLimits();
        elements.push(
          <p key={"p" + i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, fontSize: 13.5, color: "#1f2937" }}>{trimmed}</p>
        );
      }
    });
    flushBullets(); flushLimits();
    return <div>{elements}</div>;
  };
    const grouped = ["Risk Management", "Goal Planning", "Retirement Planning"].map(cat => ({ cat, items: d.selected.filter(p => p.category === cat) })).filter(g => g.items.length);
    return (
      <div className="bg-slate-200 min-h-screen">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap');
          .rpt{font-family:'Source Sans 3',system-ui,sans-serif;color:#1f2937;font-size:13.5px}
          .rpt h1,.rpt h2,.rpt .serif{font-family:'Cormorant Garamond',Georgia,serif}
          .rpt h2{color:#51037c;font-size:22px;font-weight:600;border-bottom:2px solid #51037c;padding-bottom:4px;margin:28px 0 14px}
          .rpt h3{color:#66229d;font-weight:700;font-size:14.5px;margin:18px 0 8px}
          .rpt table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0}
          .rpt th{background:#51037c;color:#fff;text-align:left;padding:6px 10px;font-weight:600}
          .rpt td{border-bottom:1px solid #e2e8f0;padding:6px 10px;vertical-align:top}
          .rpt p{text-align:justify;line-height:1.65;margin:0 0 12px}
          .rpt .tnum{text-align:right;font-variant-numeric:tabular-nums}
          .pagebreak{break-before:page}
          .rpt svg{break-inside:avoid}
          @media print{
            body{background:#fff!important}
            .no-print{display:none!important}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
            .sheet{box-shadow:none!important;margin:0!important;width:100%!important;padding:14mm 16mm!important}
            @page{size:A4;margin:0}
          }
        `}</style>
        <div className="no-print sticky top-0 z-10 text-white px-6 py-3 flex items-center justify-between" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 100%)" }}>
          <div className="text-sm"><span className="font-semibold">{displayName(client.name, "Unnamed")}</span> — report preview</div>
          <div className="flex gap-2">
            <button onClick={() => setView("edit")} className="text-sm px-3 py-1.5 rounded-lg border border-purple-400 hover:bg-purple-900">← Back to editing</button>
            <button onClick={doDownloadHTML} className="text-sm px-3 py-1.5 rounded-lg bg-white text-purple-900 font-semibold hover:bg-purple-100">⬇ Download Report</button>
            <button onClick={doDownloadDocx} className="text-sm px-3 py-1.5 rounded-lg bg-white text-purple-900 font-semibold hover:bg-purple-100">⬇ Download as Word (.docx)</button>
            <button onClick={doPrint} className="text-sm px-3 py-1.5 rounded-lg border border-white/40 text-white hover:bg-white/10">🖨 Print tips</button>
          </div>
        </div>
        {showPrintModal && (
            <div className="no-print fixed inset-0 z-50 flex items-center justify-center" style={{background:"rgba(0,0,0,0.6)"}} onClick={() => setShowPrintModal(false)}>
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4" onClick={e => e.stopPropagation()}>
                <h2 className="font-serif text-2xl text-purple-900 mb-4">Print / Save as PDF</h2>
                <p className="text-slate-600 mb-4 text-sm leading-relaxed">The print dialog can't be triggered automatically from inside the Claude artifact — the browser blocks it. Use your keyboard shortcut instead:</p>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
                  <div className="font-semibold text-purple-900 mb-2 text-sm">Desktop:</div>
                  <div className="text-sm text-slate-700">Press <kbd className="bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-xs">Ctrl+P</kbd> (Windows) or <kbd className="bg-white border border-slate-300 rounded px-2 py-0.5 font-mono text-xs">⌘+P</kbd> (Mac)</div>
                  <div className="text-xs text-slate-500 mt-2">In the dialog: set Destination to "Save as PDF", enable Background graphics, set paper to A4.</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                  <div className="font-semibold text-slate-700 mb-1 text-sm">Mobile:</div>
                  <div className="text-sm text-slate-600">Browser Share button → Print → AirPrint / Save to Files.</div>
                </div>
                <p className="text-xs text-slate-400 mb-5">For the most reliable printing, use the <b>offline HTML file</b> on your device — its Print button works directly without these steps.</p>
                <button onClick={() => setShowPrintModal(false)} className="w-full bg-purple-700 text-white font-semibold py-2.5 rounded-xl hover:bg-purple-800">Got it</button>
              </div>
            </div>
          )}
        <div id="report-content" className="rpt sheet bg-white max-w-[210mm] mx-auto my-6 shadow-xl" style={{ padding: "18mm 18mm" }}>
          {/* cover */}
          <div className="text-center pt-16 pb-10">
            <img src={LOGO} alt="GoodLife Financial Planning" style={{ maxWidth: 380, width: "72%", margin: "0 auto 24px" }} />
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-6">Affiliated with Nancy Group · in association with AIA Brunei</div>
            <div className="serif text-xl text-slate-500">Recommendation Report</div>
            <div className="serif text-lg text-slate-500 mb-3">specially prepared for</div>
            <h1 className="serif text-4xl font-semibold text-purple-950 uppercase tracking-wide mb-6">{client.name || "—"}</h1>
            {(client.dependents||[]).length > 0 && (
              <div className="text-sm text-slate-600 mb-10">
                <div className="text-xs uppercase tracking-[0.15em] text-slate-400 mb-2">Dependents</div>
                {client.dependents.map(d => (
                  <span key={d.id} className="inline-block mr-4">{d.name}{d.relationship && <span className="text-slate-400"> ({d.relationship})</span>}{d.dob && <span className="text-slate-400"> · Age {calcAge(d.dob)}</span>}</span>
                ))}
              </div>
            )}
            <div className="inline-block text-left text-sm border-t-2 border-purple-900 pt-4">
              <div className="font-semibold">Prepared by Abdul Azim Saifuddin</div>
              <div>BSc, CFP — Financial Planning Service Provider</div>
              <div>AIA Senior Life Advisor</div>
              <div className="text-slate-500 mt-2 text-xs">Authorized representative of AIA Singapore (Ref No. RFC20004468)<br/>BDCB License No: 129/AIA &amp; 288/AIA</div>
              <div className="text-slate-500 mt-2 text-xs italic">The information collected and maintained in this document will be held in the strictest confidence.</div>
              <div className="text-slate-500 mt-2 text-xs">{client.meetingDate ? "Based on our meeting of " + client.meetingDate + " · " : ""}Prepared {todayLong()}</div>
            </div>
          </div>

          <div className="pagebreak" />
          <h2>1. Executive Summary</h2>
          {n.exec ? para(n.exec) : <p className="italic text-slate-400">No executive summary yet — draft one in the Narrative step.</p>}
          {client.sections.hierarchy && (<><h3>The Hierarchy of Needs in Financial Planning</h3>{para(EDU_SECTIONS[0].body)}</>)}
          {client.sections.education && EDU_SECTIONS.slice(1).map(s => (<div key={s.id}><h3>{s.title}</h3>{para(s.body)}</div>))}

          <div className="pagebreak" />
          <h2>2. Your Finances</h2>
          <p className="mb-3">Your risk preference serves as a guide to determine your investment risk profile and to assist your planner in making recommendations. From our fact-find, we identified your risk preference as <b>{client.riskProfile || "n/a"}</b>.</p>
          <table><tbody>
            <tr><td>Total Personal Assets</td><td className="tnum">{money(d.personal)}</td></tr>
            <tr><td>Total Invested Assets</td><td className="tnum">{money(d.invested)}</td></tr>
            <tr><td>Total Cash / Cash Equivalents</td><td className="tnum">{money(d.cash)}</td></tr>
            <tr><td className="font-semibold">Total Assets</td><td className="tnum font-semibold">{money(d.totalAssets)}</td></tr>
            <tr><td>Total Liabilities</td><td className="tnum">({money(d.totalLiab)})</td></tr>
            <tr><td className="font-bold text-purple-900">NET WORTH</td><td className="tnum font-bold text-purple-900">{money(d.netWorth)}</td></tr>
          </tbody></table>
          {d.assetPie.length > 0 && (<div className="my-3"><StaticDonut data={d.assetPie} colorMap={ASSET_COLORS} /></div>)}
          <p className="text-xs text-slate-500 mb-4">Personal-use assets (houses, vehicles) form part of your standard of living and are normally not drawn upon at death or retirement. Invested assets are held to produce income or capital growth and are available to you or your dependants. Cash and equivalents can normally be liquidated within 12 months and form part of your Emergency Fund.</p>
          <h3>2.1 Your Cash Flow Summary</h3>
          <table><tbody>
            <tr><td>Net Income (take-home)</td><td className="tnum">{money(d.net)} / month</td></tr>
            <tr><td>Total Expenses</td><td className="tnum">({money(d.totalExpenses)}) / month</td></tr>
            <tr><td className="font-bold">{d.surplus >= 0 ? "Surplus" : "Shortfall"}</td><td className={"tnum font-bold " + (d.surplus >= 0 ? "text-purple-900" : "text-red-700")}>{money(Math.abs(d.surplus))} / month</td></tr>
          </tbody></table>
          {client.sections.allocation && (<>
            <h3>The 4-3-2-1 Money Management Framework</h3>
            <p className="mb-2">A 4-3-2-1 money management concept is recommended within your budget system — allocating income across loans, expenditures, savings and protection.</p>
            <table>
              <thead><tr><th>Allocation</th><th className="tnum">Guideline</th><th className="tnum">Optimal ($/mo)</th><th className="tnum">Current ($/mo)</th><th className="tnum">Current %</th></tr></thead>
              <tbody>{d.alloc.map(a => (
                <tr key={a.label}><td>{a.label}</td><td className="tnum">{a.pct * 100}%</td><td className="tnum">{money(a.optimal)}</td><td className="tnum">{money(a.current)}</td><td className="tnum">{fmt(a.curPct * 100, 0)}%</td></tr>
              ))}</tbody>
            </table>
            {d.pie.length > 0 && (<div className="my-3"><StaticDonut data={d.pie} colorMap={PIE_COLORS} /></div>)}
          </>)}
          {client.sections.ratios && (<>
            <h3>2.2 Financial Ratio Analysis</h3>
            <p className="mb-2">Your financial ratios represent your current position and change over time. No single ratio should be reviewed in isolation or be conclusive of your financial position.</p>
            <table>
              <thead><tr><th>Ratio</th><th className="tnum">Benchmark</th><th className="tnum">Yours</th><th>Reading</th></tr></thead>
              <tbody>{d.ratios.map(r => (
                <tr key={r.id}>
                  <td><b>{r.name}</b><div className="text-xs text-slate-500">{r.desc}</div></td>
                  <td className="tnum">{r.dir === ">=" ? "≥ " : "≤ "}{r.id === "liquidity" ? r.target + " mo" : fmt(r.target * 100, 0) + "%"}</td>
                  <td className="tnum">{r.value == null ? "—" : r.fmtV(r.value)}</td>
                  <td className={r.pass == null ? "" : r.pass ? "text-purple-800 font-semibold" : "text-red-700 font-semibold"}>{r.pass == null ? "n/a" : r.pass ? "Healthy" : "Needs attention"}</td>
                </tr>
              ))}</tbody>
            </table>
            {/* Emergency Fund gauge — shown separately */}
            {d.cash > 0 && d.ef6 > 0 && (() => {
              const months = d.totalExpenses > 0 ? d.cash / d.totalExpenses : 0;
              const pass3 = months >= 3; const pass6 = months >= 6;
              const pct3 = Math.min(100, (d.cash / d.ef3) * 100);
              const pct6 = Math.min(100, (d.cash / d.ef6) * 100);
              return (
                <div className="my-4 border border-slate-200 rounded-xl p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Emergency Fund — {fmt(months,1)} months of expenses</div>
                  {[["3-Month Target", d.ef3, pct3, pass3], ["6-Month Target", d.ef6, pct6, pass6]].map(([label, target, pct, pass]) => (
                    <div key={label} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{label}: {money(target)}</span>
                        <span className={pass ? "text-purple-700 font-semibold" : "text-red-600 font-semibold"}>{pass ? "✓ Met" : "⚠ Shortfall " + money(Math.max(0, target - d.cash))}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className={"h-3 rounded-full " + (pass ? "bg-purple-600" : "bg-red-500")} style={{ width: pct + "%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {d.ratioBars.length > 0 && (<div className="my-3"><div className="text-xs text-slate-500 mb-1">Financial ratios vs. benchmark — capped at 100% (green = healthy, red = needs attention).</div><StaticRatioBars data={d.ratioBars} /></div>)}
          </>)}

          <div className="pagebreak" />
          <h2>3. Your Concerns &amp; Objectives</h2>
          <h3>3.1 Income Replacement</h3>
          <p className="mb-2">To provide an income of {money(num(client.incomeReplacement.monthly))} per month in the event of premature death or total permanent disability, for {client.incomeReplacement.years} years from today (potential income of {money(d.potentialIncome)}).</p>
          <table>
            <thead><tr><th>Need</th><th>Guideline</th><th className="tnum">Benchmark</th><th className="tnum">Current</th><th className="tnum">Shortfall</th></tr></thead>
            <tbody>{d.irRows.map(r => (
              <tr key={r.name}><td>{r.name}</td><td>{r.guideline}</td><td className="tnum">{money(r.bench)}</td><td className="tnum">{money(r.current)}</td><td className={"tnum " + (r.shortfall > 0 ? "text-red-700 font-semibold" : "text-purple-800")}>{money(r.shortfall)}</td></tr>
            ))}</tbody>
          </table>
          <p className="text-xs text-slate-500 mb-4">Without adequate coverage for death, disability and sickness: (i) your SPK and other income might not be sufficient to support family expenses; (ii) you might have to downgrade to a less desired lifestyle.</p>
          <h3>3.2 Retirement Planning</h3>
          <p className="mb-2">To provide a minimum of {money(num(client.retirement.monthly))} per month for {client.retirement.years} years after retirement (assuming post-retirement savings follow the rate of inflation).</p>
          <table><tbody>
            <tr><td>Amount required ({client.retirement.years} years)</td><td className="tnum">{money(d.rtRequired)}</td></tr>
            <tr><td>Inflation-adjusted ({client.retirement.inflation}% over {client.retirement.yearsToRetire} years)</td><td className="tnum">{money(d.rtAdjusted)}</td></tr>
            <tr><td>SPK (Member Account, projected)</td><td className="tnum">{money(num(client.retirement.spkProj))}</td></tr>
            <tr><td>SPK Annuity (Employer){num(client.retirement.spkAnnuityMonthly) > 0 ? " — " + money(num(client.retirement.spkAnnuityMonthly)) + "/mo for " + client.retirement.spkAnnuityYears + " yrs" : ""}</td><td className="tnum">{money(d.spkAnnuityTotal)}</td></tr>
            <tr><td>Old Age Pension</td><td className="tnum">{money(num(client.retirement.pension))}</td></tr>
            <tr><td>Other: Annuities (projected)</td><td className="tnum">{money(d.annTotal)}</td></tr>
            <tr><td>Other: Investments (projected)</td><td className="tnum">{money(d.invTotal)}</td></tr>
            <tr><td className="font-semibold">Total projected arrangement</td><td className="tnum font-semibold">{money(d.rtProjected)}</td></tr>
            <tr><td className="font-bold">Projected shortfall</td><td className={"tnum font-bold " + (d.rtShortfall > 0 ? "text-red-700" : "text-purple-900")}>{money(d.rtShortfall)}</td></tr>
          </tbody></table>
          <p className="text-xs text-slate-500">With the current projection you can expect a monthly retirement annuity of approximately <b>{money(d.rtMonthlyAnnuity)}</b>.</p>
          {(client.otherObjectives || []).filter(o => o.name || num(o.target) > 0).length > 0 && (<>
            <h3>3.3 Other Objectives</h3>
            <table>
              <thead><tr><th>Objective</th><th>Remarks</th><th className="tnum">Target</th><th className="tnum">Horizon</th><th className="tnum">Indicative saving</th></tr></thead>
              <tbody>{(client.otherObjectives || []).filter(o => o.name || num(o.target) > 0).map(o => (
                <tr key={o.id}><td>{o.name}</td><td>{o.note}</td><td className="tnum">{money(num(o.target))}</td><td className="tnum">{num(o.years) > 0 ? o.years + " yrs" : "—"}</td><td className="tnum">{num(o.target) > 0 && num(o.years) > 0 ? money(num(o.target) / (num(o.years) * 12)) + "/mo" : "—"}</td></tr>
              ))}</tbody>
            </table>
          </>)}

          <div className="pagebreak" />
          <h2>4. Recommendation</h2>
          {n.recoIntro ? para(n.recoIntro) : <p className="italic text-slate-400">No recommendation narrative yet — draft one in the Narrative step.</p>}
          {n.actionPlan && (<><h3>Action Plan</h3>{para(n.actionPlan)}</>)}

          <h3>4.1 Recommended Plans</h3>
          <p className="mb-2">The main purpose of these plan recommendations is to prioritise protecting your income — ensuring financial security for you and your family — and to prepare funds for retirement, including addressing potential income loss due to disability or sickness.</p>
          <table><tbody>
            <tr><td>Emergency fund needed (3–6 months of expenses)</td><td className="tnum">{money(d.ef3)} – {money(d.ef6)}</td></tr>
            <tr><td>Amount saved</td><td className="tnum">{money(d.cash)}</td></tr>
            <tr><td className="font-semibold">{d.cash >= d.ef3 ? "Within target" : "Shortfall to 3-month target"}</td><td className={"tnum font-semibold " + (d.cash >= d.ef3 ? "text-purple-900" : "text-red-700")}>{money(Math.max(0, d.ef3 - d.cash))}</td></tr>
          </tbody></table>
          {grouped.map(g => (
            <div key={g.cat}>
              <h3>{g.cat}</h3>
              <table>
                <thead><tr><th>Plan</th><th>Coverage</th><th className="tnum">Monthly</th><th className="tnum">Annual</th><th>Projected returns</th></tr></thead>
                <tbody>{g.items.map(p => (
                  <tr key={p.key}>
                    <td><b>{p.label}</b><div><span className={"inline-block text-[10px] px-1.5 py-0.5 rounded mt-1 " + TIER_META[p.tier].chip}>{TIER_META[p.tier].label}</span></div></td>
                    <td>{p.coverage}</td><td className="tnum">{money(num(p.monthly), 2)}</td><td className="tnum">{money(num(p.annual), 2)}</td><td className="text-xs">{p.returns}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          {d.selected.length > 0 && (
            <table><tbody><tr><td className="font-bold">Total of plans shown</td><td className="tnum font-bold">{money(d.premMonthly, 2)} / month · {money(d.premAnnual, 2)} / year</td></tr></tbody></table>
          )}
          <p className="text-xs text-slate-500 mt-2"><b>Recommended</b> plans fit within the indicated budget of {client.budgetNote}. <b>Worth considering</b> are additional options currently outside that budget. <b>Future options</b> are plans to explore as your finances allow or as priorities evolve. Returns are based on the Projected Investment Rate of Return on AIA's Participating Fund at 4.25% p.a. unless stated otherwise.</p>

          {d.selected.length > 0 && (<><div className="pagebreak" /><h2>5. Explanation of Plan Options</h2>
            {d.selected.map((p, i) => (
              <div key={p.key + i}>
                <h3>{i + 1}. {PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label}</h3>
                {PLAN_LIBRARY[p.key] && renderPlanBody(PLAN_LIBRARY[p.key].body)}
                {(p.planImages||[]).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {p.planImages.map(img => (
                      <div key={img.id} style={{ breakInside: "avoid", marginBottom: 16 }}>
                        <img src={img.dataUrl} alt={img.caption||img.name} style={{ maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 6 }} />
                        {img.caption && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, textAlign: "center", fontStyle: "italic" }}>{img.caption}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}</>)}

          <div className="pagebreak" />
          <h2>{d.selected.length > 0 ? "6" : "5"}. Conclusion</h2>
          {para("The above recommendation is based on my best knowledge and professional advice, as if I were in your shoes. All premiums and coverage amounts can be adjusted to your needs. The budget set aside for the above objectives should be around 20–30% of individual income, to encourage progress toward future goals while still enjoying the lifestyle you want during your working years.\n\nThe plan is designed to encourage you to accumulate as much as you can to reduce future shortfalls, and to keep you protected along the course of your joyful life.\n\nIt is advised that we meet at least once a year to review your financial standing and track the progress of your financial plan.")}
          <h3>Client Acknowledgement</h3>
          {para("I/We understand that the IA will furnish me with a copy of the complete Financial Health Review signed by me/us. I/We acknowledge that the considerations (where applicable) set out in your sales advisory guide have been highlighted and explained to me/us by the IA.\n\nI/We have understood and acknowledge receipt of the following documents in relation to the products recommended: product summary(s) and benefit illustration(s) applicable to life insurance and/or Accident & Health insurance. I/We acknowledge that the fees, charges and commission for the product(s) chosen (not applicable to Accident & Health insurance) have been disclosed and explained to me/us by reference to relevant disclosure documents; for Accident & Health insurance products, this is available upon written request.\n\nThe IA has explained to me/us in detail the recommendations made, and any investment decision has been arrived at independently by me/us without inducement or pressure. I have been informed of the risks of investment in the products recommended and appreciate fully the nature and extent of such risks and their consequences to my financial plans should such risks materialise.\n\nI/We understand that any incomplete or inaccurate information provided by me/us may affect the suitability of any recommendations made.")}
          <div className="grid grid-cols-2 gap-10 my-8 text-sm">
            <div><div className="border-b border-slate-400 h-12"></div>Client's Signature &amp; Date</div>
            <div><div className="border-b border-slate-400 h-12"></div>&nbsp;</div>
          </div>
          <h3>IA's Declaration</h3>
          {para("I declare that the information provided in this financial health review is strictly confidential and is only to be used for the purpose of fact-finding in the process of recommending suitable insurance products, and shall not be used for any other purpose.")}
          <div className="grid grid-cols-2 gap-10 my-8 text-sm">
            <div><div className="border-b border-slate-400 h-12"></div>IA's Signature &amp; Date</div>
            <div></div>
          </div>
          <div className="text-center text-xs text-slate-400 mt-10 pt-4 border-t border-slate-200">GoodLife Financial Planning · Abdul Azim Saifuddin, CFP · AIA Senior Life Advisor</div>
        </div>
      </div>
    );
  }

  // ----- edit view -----
  return (
    <div className="min-h-screen bg-slate-100">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap'); .font-serif{font-family:'Cormorant Garamond',Georgia,serif} body{font-family:'Source Sans 3',system-ui,sans-serif}`}</style>
      <header className="text-white sticky top-0 z-10" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 100%)" }}>
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { persist(); setView("list"); }} className="text-sm text-purple-300 hover:text-white">← Clients</button>
            <span className="font-serif text-lg">{displayName(client.name, "New client")}</span>
          </div>
          <div className="flex items-center gap-2">
            {saveState && <span className="text-xs text-purple-300">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save failed"}</span>}
            <button onClick={persist} className="text-sm px-3 py-1.5 rounded-lg border border-purple-400 hover:bg-purple-900">Save</button>
            <button onClick={() => { persist(); setView("report"); }} className="text-sm px-3 py-1.5 rounded-lg bg-white text-purple-900 font-semibold hover:bg-purple-100">Preview report →</button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => setStep(i)} className={"text-sm px-4 py-2 rounded-t-lg whitespace-nowrap " + (step === i ? "bg-slate-100 text-purple-900 font-semibold" : "text-purple-300 hover:text-white")}>{i + 1}. {s}</button>
          ))}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* live summary strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Net income /mo" value={money(d.net)} />
          <Stat label="Allocated /mo" value={money(d.totalExpenses)} />
          <Stat label={d.surplus >= 0 ? "Unallocated /mo" : "Shortfall /mo"} value={money(Math.abs(d.surplus))} accent />
          <Stat label="Plans selected /mo" value={money(d.premMonthly, 2)} gold />
        </div>

        {step === 0 && (<>
          <SectionCard title="Client profile (KYC)">
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Full name"><Input value={client.name} onChange={e => update({ name: e.target.value })} /></Field>
              <Field label="Date of birth"><Input type="date" value={client.dob} onChange={e => update({ dob: e.target.value })} /></Field>
              <Field label="Age"><Input value={calcAge(client.dob)} readOnly className="bg-slate-50" /></Field>
              <Field label="Occupation"><Input value={client.occupation} onChange={e => update({ occupation: e.target.value })} /></Field>
              <Field label="Occupation details"><Input value={client.occDetails} onChange={e => update({ occDetails: e.target.value })} /></Field>
              <Field label="Meeting date (for the report)"><Input value={client.meetingDate} onChange={e => update({ meetingDate: e.target.value })} placeholder="e.g. 5th September 2025" /></Field>
              <Field label="Risk profile (from fact-find)">
                <select value={client.riskProfile} onChange={e => update({ riskProfile: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">n/a</option><option>Conservative</option><option>Moderately Conservative</option><option>Balanced</option><option>Moderately Aggressive</option><option>Aggressive</option>
                </select>
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Priorities (5 = highest)">
            <div className="space-y-2">
              {client.priorities.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-purple-900 text-white text-sm flex items-center justify-center shrink-0">{5 - i}</span>
                  <Input value={p} onChange={e => { const ps = [...client.priorities]; ps[i] = e.target.value; update({ priorities: ps }); }} placeholder={i === 0 ? "e.g. Retirement planning" : ""} />
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Dependents / People under client's care" right={
              <button onClick={() => update({ dependents: [...(client.dependents||[]), { id: uid(), name: "", relationship: "", dob: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add dependent</button>}>
            {(client.dependents||[]).length === 0 && <div className="text-sm text-slate-400">No dependents added yet.</div>}
            <div className="space-y-2">
              {(client.dependents||[]).map((dep, i) => (
                <div key={dep.id||i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5"><Field label={i===0?"Name":""}><Input value={dep.name} onChange={e => { const l=[...client.dependents]; l[i]={...dep,name:e.target.value}; update({dependents:l}); }} placeholder="e.g. Nur Aisyah" /></Field></div>
                  <div className="col-span-3"><Field label={i===0?"Relationship":""}><Input value={dep.relationship} onChange={e => { const l=[...client.dependents]; l[i]={...dep,relationship:e.target.value}; update({dependents:l}); }} placeholder="e.g. Daughter" /></Field></div>
                  <div className="col-span-3"><Field label={i===0?"Date of birth":""}><Input type="date" value={dep.dob} onChange={e => { const l=[...client.dependents]; l[i]={...dep,dob:e.target.value}; update({dependents:l}); }} /></Field></div>
                  <div className="col-span-1 flex items-end pb-1"><button onClick={() => update({dependents:client.dependents.filter((_,j)=>j!==i)})} className="text-red-500 text-sm">✕</button></div>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Your notes on the client's concerns (feeds the AI draft)">
            <TextArea rows={4} value={client.concernsNote} onChange={e => update({ concernsNote: e.target.value })} placeholder="e.g. Focused on growing funds for retirement; primary responsibility is children's welfare and education; spouse handles most other obligations; no current insurance coverage for either spouse…" />
          </SectionCard>
        </>)}

        {step === 1 && (<>
          <SectionCard title="Income">
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Basic salary ($/mo)" hint={money(num(client.income.basic) * 12) + "/yr"}><NumInput value={client.income.basic} onChange={e => updateDeep("income", { basic: e.target.value })} /></Field>
              <Field label="Bonus(es) ($/yr)" hint={"≈ " + money(num(client.income.bonuses) / 12, 2) + "/mo"}><NumInput value={client.income.bonuses} onChange={e => updateDeep("income", { bonuses: e.target.value })} /></Field>
              <Field label="SPK %" hint={"SPK deduction: " + money(d.spk, 2) + "/mo"}><NumInput value={client.income.spkPct} onChange={e => updateDeep("income", { spkPct: e.target.value })} /></Field>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allowance(s)</span>
                <button onClick={() => updateDeep("income", { allowances: [...(client.income.allowances || []), { id: uid(), note: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add allowance</button>
              </div>
              {(client.income.allowances || []).length === 0 && <div className="text-sm text-slate-400">No allowances added.</div>}
              <NoteAmountRows rows={client.income.allowances || []} onChange={l => updateDeep("income", { allowances: l })} notePlaceholder="e.g. housing, gas, transport" />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Others</span>
                <button onClick={() => updateDeep("income", { others: [...(client.income.others || []), { id: uid(), note: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add others</button>
              </div>
              {(client.income.others || []).length === 0 && <div className="text-sm text-slate-400">No other income added.</div>}
              <NoteAmountRows rows={client.income.others || []} onChange={l => updateDeep("income", { others: l })} notePlaceholder="e.g. business, nafkah, dividends, subsidies" />
            </div>
            <div className="mt-4 text-sm text-slate-600 border-t border-slate-100 pt-3">Net income (take-home): <b className="text-purple-900">{money(d.net, 2)}</b> / month · <b className="text-purple-900">{money(d.net * 12, 0)}</b> / year</div>
          </SectionCard>
          {EXPENSE_GROUPS.map(g => (
            <SectionCard key={g.id} title={g.label + " — " + money(d.groupTotals[g.id]) + "/mo · " + money(d.groupTotals[g.id] * 12) + "/yr"} right={
              <button onClick={() => updateDeep("expenses", { [g.id]: [...(client.expenses[g.id] || []), { id: uid(), label: "", amount: "", note: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add row</button>}>
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                <div className="col-span-4">Item</div><div className="col-span-2">$/month</div><div className="col-span-2 text-right">$/year</div><div className="col-span-3">Remarks (if any)</div><div className="col-span-1"></div>
              </div>
              <div className="space-y-2">
                {(client.expenses[g.id] || []).map((row, i) => (
                  <div key={row.id || i} className="grid grid-cols-12 gap-2">
                    <div className="col-span-4"><Input value={row.label} onChange={e => { const list = [...client.expenses[g.id]]; list[i] = { ...row, label: e.target.value }; updateDeep("expenses", { [g.id]: list }); }} placeholder="Item" /></div>
                    <div className="col-span-2"><NumInput value={row.amount} onChange={e => { const list = [...client.expenses[g.id]]; list[i] = { ...row, amount: e.target.value }; updateDeep("expenses", { [g.id]: list }); }} /></div>
                    <div className="col-span-2 text-right text-xs text-slate-500 tabular-nums self-center">{money(num(row.amount) * 12)}/yr</div>
                    <div className="col-span-3"><Input value={row.note} onChange={e => { const list = [...client.expenses[g.id]]; list[i] = { ...row, note: e.target.value }; updateDeep("expenses", { [g.id]: list }); }} placeholder="Remarks (if any)" /></div>
                    <div className="col-span-1 flex items-center"><button onClick={() => updateDeep("expenses", { [g.id]: client.expenses[g.id].filter((_, j) => j !== i) })} className="text-red-500 text-sm">✕</button></div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
          <div className="grid md:grid-cols-2 gap-5 items-start">
            <SectionCard title="Where the income goes (live)">
              {d.pie.length === 0 ? <div className="text-sm text-slate-400 py-10 text-center">Enter income and allocations to see the chart.</div> : <AllocationPie data={d.pie} />}
            </SectionCard>
            <SectionCard title="4-3-2-1 allocation check">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Bucket</th><th className="text-right">Optimal</th><th className="text-right">Current</th><th className="text-right">Current %</th></tr></thead>
                <tbody>{d.alloc.map(a => (
                  <tr key={a.label} className="border-t border-slate-100"><td className="py-1.5">{a.label} ({a.pct * 100}%)</td><td className="text-right tabular-nums">{money(a.optimal)}</td><td className="text-right tabular-nums">{money(a.current)}</td><td className="text-right tabular-nums">{fmt(a.curPct * 100, 0)}%</td></tr>
                ))}</tbody>
              </table>
            </SectionCard>
          </div>
        </>)}

        {step === 2 && (<>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <Stat label="Total assets" value={money(d.totalAssets)} />
            <Stat label="Total liabilities" value={money(d.totalLiab)} />
            <Stat label="Net worth" value={money(d.netWorth)} accent />
          </div>
          <SectionCard title={"Invested assets — " + money(d.invested)} right={<button onClick={() => updateDeep("assets", { invested: [...client.assets.invested, { id: uid(), name: "", current: "", future: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add asset</button>}>
            <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
              <div className="col-span-5">Asset</div><div className="col-span-3">Current value</div><div className="col-span-3">Future value (proj.)</div><div className="col-span-1"></div>
            </div>
            <div className="space-y-2">
              {client.assets.invested.map((a, i) => (
                <div key={a.id || i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-5"><Input value={a.name} onChange={e => { const inv = [...client.assets.invested]; inv[i] = { ...a, name: e.target.value }; updateDeep("assets", { invested: inv }); }} placeholder="e.g. SPK" /></div>
                  <div className="col-span-3"><NumInput value={a.current} onChange={e => { const inv = [...client.assets.invested]; inv[i] = { ...a, current: e.target.value }; updateDeep("assets", { invested: inv }); }} /></div>
                  <div className="col-span-3"><NumInput value={a.future} onChange={e => { const inv = [...client.assets.invested]; inv[i] = { ...a, future: e.target.value }; updateDeep("assets", { invested: inv }); }} /></div>
                  <div className="col-span-1 flex items-center"><button onClick={() => updateDeep("assets", { invested: client.assets.invested.filter((_, j) => j !== i) })} className="text-red-500 text-sm">✕</button></div>
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title={"Liquid assets (cash & equivalents) — " + money(d.cash)} right={<button onClick={() => updateDeep("assets", { liquid: [...client.assets.liquid, { id: uid(), name: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add asset</button>}>
            <MoneyRows rows={client.assets.liquid} onChange={l => updateDeep("assets", { liquid: l })} namePlaceholder="e.g. Savings account" />
            <div className="mt-2 text-sm text-slate-600">Emergency fund target: {money(d.ef3)} (3 mo) – {money(d.ef6)} (6 mo)</div>
          </SectionCard>
          <SectionCard title={"Personal items — " + money(d.personal)} right={<button onClick={() => updateDeep("assets", { personal: [...client.assets.personal, { id: uid(), name: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add asset</button>}>
            <MoneyRows rows={client.assets.personal} onChange={l => updateDeep("assets", { personal: l })} namePlaceholder="e.g. Motor vehicle" />
          </SectionCard>
          <SectionCard title={"Liabilities — " + money(d.totalLiab)} right={<button onClick={() => update({ liabilities: [...client.liabilities, { id: uid(), name: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add liability</button>}>
            <MoneyRows rows={client.liabilities} onChange={l => update({ liabilities: l })} namePlaceholder="e.g. Personal loan" />
            <div className="mt-2 text-sm text-slate-600">Net worth: <b className="text-purple-900">{money(d.netWorth)}</b></div>
          </SectionCard>
          <div className="grid md:grid-cols-2 gap-5 items-start">
            <SectionCard title="Asset composition">
              {d.assetPie.length === 0 ? <div className="text-sm text-slate-400 py-10 text-center">Enter asset values to see the chart.</div> : <AssetPie data={d.assetPie} />}
            </SectionCard>
            <SectionCard title="Financial health ratios">
              {d.ratioBars.length === 0 ? <div className="text-sm text-slate-400 py-10 text-center">Enter figures to see the comparison.</div> : <RatioBars data={d.ratioBars} />}
            </SectionCard>
          </div>
          <SectionCard title="Financial health ratios (detail)">
            <div className="grid md:grid-cols-2 gap-3">
              {d.ratios.map(r => (
                <div key={r.id} className={"rounded-lg border px-3 py-2 text-sm " + (r.pass == null ? "border-slate-200 bg-slate-50" : r.pass ? "border-purple-300 bg-purple-50" : "border-red-300 bg-red-50")}>
                  <div className="flex justify-between"><b>{r.name}</b><span className="tabular-nums">{r.value == null ? "—" : r.fmtV(r.value)}</span></div>
                  <div className="text-xs text-slate-500">Benchmark {r.dir === ">=" ? "≥" : "≤"} {r.id === "liquidity" ? r.target + " months" : fmt(r.target * 100, 0) + "%"} · {r.pass == null ? "n/a" : r.pass ? "Healthy" : "Needs attention"}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>)}

        {step === 3 && (<>
          <SectionCard title="3.1 Income replacement objective">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <Field label="Income to replace ($/month)"><NumInput value={client.incomeReplacement.monthly} onChange={e => updateDeep("incomeReplacement", { monthly: e.target.value })} /></Field>
              <Field label="For how many years"><NumInput value={client.incomeReplacement.years} onChange={e => updateDeep("incomeReplacement", { years: e.target.value })} /></Field>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <Field label="Current Death/TPD cover"><NumInput value={client.incomeReplacement.covDeath} onChange={e => updateDeep("incomeReplacement", { covDeath: e.target.value })} /></Field>
              <Field label="Current Major CI cover"><NumInput value={client.incomeReplacement.covMCI} onChange={e => updateDeep("incomeReplacement", { covMCI: e.target.value })} /></Field>
              <Field label="Current Early CI cover"><NumInput value={client.incomeReplacement.covECI} onChange={e => updateDeep("incomeReplacement", { covECI: e.target.value })} /></Field>
              <Field label="Current Accident cover"><NumInput value={client.incomeReplacement.covAccident} onChange={e => updateDeep("incomeReplacement", { covAccident: e.target.value })} /></Field>
            </div>
            <table className="w-full text-sm mt-4">
              <thead><tr className="text-left text-slate-500"><th className="py-1">Need</th><th className="text-right">Benchmark</th><th className="text-right">Current</th><th className="text-right">Shortfall</th></tr></thead>
              <tbody>{d.irRows.map(r => (
                <tr key={r.name} className="border-t border-slate-100"><td className="py-1.5">{r.name} <span className="text-xs text-slate-400">({r.guideline})</span></td><td className="text-right tabular-nums">{money(r.bench)}</td><td className="text-right tabular-nums">{money(r.current)}</td><td className={"text-right tabular-nums font-semibold " + (r.shortfall > 0 ? "text-red-600" : "text-purple-700")}>{money(r.shortfall)}</td></tr>
              ))}</tbody>
            </table>
          </SectionCard>
          <SectionCard title="3.2 Retirement planning objective">
            <div className="grid md:grid-cols-4 gap-4 mb-4">
              <Field label="Retirement income ($/month)"><NumInput value={client.retirement.monthly} onChange={e => updateDeep("retirement", { monthly: e.target.value })} /></Field>
              <Field label="Years in retirement"><NumInput value={client.retirement.years} onChange={e => updateDeep("retirement", { years: e.target.value })} /></Field>
              <Field label="Years until retirement"><NumInput value={client.retirement.yearsToRetire} onChange={e => updateDeep("retirement", { yearsToRetire: e.target.value })} /></Field>
              <Field label="Inflation % p.a."><NumInput value={client.retirement.inflation} onChange={e => updateDeep("retirement", { inflation: e.target.value })} /></Field>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="SPK projected (lump sum at retirement)"><NumInput value={client.retirement.spkProj} onChange={e => updateDeep("retirement", { spkProj: e.target.value })} /></Field>
              <Field label="Old age pension (total)"><NumInput value={client.retirement.pension} onChange={e => updateDeep("retirement", { pension: e.target.value })} /></Field>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">SPK Annuity (Employer) — total: <span className="text-purple-900">{money(d.spkAnnuityTotal)}</span></div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Monthly amount"><NumInput value={client.retirement.spkAnnuityMonthly} onChange={e => updateDeep("retirement", { spkAnnuityMonthly: e.target.value })} /></Field>
                <Field label="Number of years"><NumInput value={client.retirement.spkAnnuityYears} onChange={e => updateDeep("retirement", { spkAnnuityYears: e.target.value })} /></Field>
              </div>
            </div>
            {[["annuities", "Other: Annuities", d.annTotal], ["investments", "Other: Investments", d.invTotal]].map(([key, label, total]) => (
              <div key={key} className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label} — projected: <span className="text-purple-900">{money(total)}</span></div>
                <div className="grid md:grid-cols-4 gap-4">
                  <Field label="Current amount"><NumInput value={client.retirement[key].current} onChange={e => updateDeep("retirement", { [key]: { ...client.retirement[key], current: e.target.value } })} /></Field>
                  <Field label="Contribution ($/mo)"><NumInput value={client.retirement[key].contrib} onChange={e => updateDeep("retirement", { [key]: { ...client.retirement[key], contrib: e.target.value } })} /></Field>
                  <Field label="Return % p.a."><NumInput value={client.retirement[key].rate} onChange={e => updateDeep("retirement", { [key]: { ...client.retirement[key], rate: e.target.value } })} /></Field>
                  <Field label="Years" hint="Blank = years until retirement"><NumInput value={client.retirement[key].years} onChange={e => updateDeep("retirement", { [key]: { ...client.retirement[key], years: e.target.value } })} /></Field>
                </div>
              </div>
            ))}
            <div className="mt-4 grid md:grid-cols-3 gap-3">
              <Stat label="Required (inflation-adjusted)" value={money(d.rtAdjusted)} />
              <Stat label="Projected arrangement" value={money(d.rtProjected)} />
              <Stat label="Shortfall" value={money(d.rtShortfall)} accent />
            </div>
            <div className="text-sm text-slate-600 mt-2">Expected monthly retirement annuity at current projection: <b>{money(d.rtMonthlyAnnuity)}</b></div>
          </SectionCard>
          <SectionCard title="3.3 Other objectives" right={<button onClick={() => update({ otherObjectives: [...(client.otherObjectives || []), { id: uid(), name: "", target: "", years: "", note: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add objective</button>}>
            <div className="flex flex-wrap gap-2 mb-3">
              {OBJECTIVE_PRESETS.map(p => (
                <button key={p} onClick={() => update({ otherObjectives: [...(client.otherObjectives || []), { id: uid(), name: p, target: "", years: "", note: "" }] })} className="text-xs px-2.5 py-1 rounded-full border border-purple-700 text-purple-800 hover:bg-purple-50">+ {p}</button>
              ))}
            </div>
            {(client.otherObjectives || []).length === 0 && <div className="text-sm text-slate-400">No other objectives yet — tap a suggestion above or add your own.</div>}
            {(client.otherObjectives || []).length > 0 && (
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                <div className="col-span-3">Objective</div><div className="col-span-2">Target $</div><div className="col-span-2">Years</div><div className="col-span-2 text-right">Saving needed</div><div className="col-span-2">Remarks</div><div className="col-span-1"></div>
              </div>
            )}
            <div className="space-y-2">
              {(client.otherObjectives || []).map((o, i) => (
                <div key={o.id || i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-3"><Input value={o.name} onChange={e => { const l = [...client.otherObjectives]; l[i] = { ...o, name: e.target.value }; update({ otherObjectives: l }); }} placeholder="Objective" /></div>
                  <div className="col-span-2"><NumInput value={o.target} onChange={e => { const l = [...client.otherObjectives]; l[i] = { ...o, target: e.target.value }; update({ otherObjectives: l }); }} /></div>
                  <div className="col-span-2"><NumInput value={o.years} onChange={e => { const l = [...client.otherObjectives]; l[i] = { ...o, years: e.target.value }; update({ otherObjectives: l }); }} /></div>
                  <div className="col-span-2 text-right text-xs text-slate-500 tabular-nums">{num(o.target) > 0 && num(o.years) > 0 ? money(num(o.target) / (num(o.years) * 12)) + "/mo" : "—"}</div>
                  <div className="col-span-2"><Input value={o.note} onChange={e => { const l = [...client.otherObjectives]; l[i] = { ...o, note: e.target.value }; update({ otherObjectives: l }); }} placeholder="Remarks (if any)" /></div>
                  <div className="col-span-1 flex items-center"><button onClick={() => update({ otherObjectives: client.otherObjectives.filter((_, j) => j !== i) })} className="text-red-500 text-sm">✕</button></div>
                </div>
              ))}
            </div>
          </SectionCard>
        </>)}

        {step === 4 && (<>
          <SectionCard title="Plan quotation table" right={<span className="text-sm text-slate-500">Selected: {money(d.premMonthly, 2)}/mo · {money(d.premAnnual, 2)}/yr</span>}>
            <Field label="Client's indicated monthly budget (appears in the report legend)">
              <Input value={client.budgetNote} onChange={e => update({ budgetNote: e.target.value })} />
            </Field>
            <div className="space-y-3 mt-4">
              {client.products.map((p, i) => (
                <div key={p.key} className={"rounded-xl border-2 p-4 transition-shadow " + (p.include ? TIER_META[p.tier].cls + " ring-2 ring-purple-600 shadow-md" : "border-slate-200 bg-slate-50 opacity-70")}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <label className="flex items-center gap-2 font-semibold text-slate-800">
                      <input type="checkbox" checked={p.include} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, include: e.target.checked }; update({ products: ps }); }} className="w-4 h-4 accent-purple-700" />
                      <span className="text-xs bg-slate-200 rounded px-1.5 py-0.5">{p.key}</span> {p.label}
                    </label>
                    <select value={p.tier} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, tier: e.target.value }; update({ products: ps }); }} className="text-sm rounded-lg border border-slate-300 px-2 py-1 bg-white">
                      <option value="recommended">Recommended (in budget)</option>
                      <option value="optional">Worth considering (outside budget)</option>
                      <option value="future">Future option</option>
                    </select>
                  </div>
                  {p.include && (
                    <>
                    <div className="grid md:grid-cols-12 gap-3 mt-3">
                      <div className="md:col-span-3"><Field label="Plan label (as shown in report)"><Input value={p.label} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, label: e.target.value }; update({ products: ps }); }} /></Field></div>
                      <div className="md:col-span-1"><Field label="To be insured">
                        <select value={p.insuredBy||"self"} onChange={e => { const ps=[...client.products]; ps[i]={...p,insuredBy:e.target.value}; update({products:ps}); }} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                          <option value="self">Self</option>
                          {(client.dependents||[]).map(d => <option key={d.id} value={d.id}>{d.name||"(unnamed)"}{d.relationship?" ("+d.relationship+")":""}</option>)}
                        </select>
                      </Field></div>
                      <div className="md:col-span-2"><Field label="Coverage"><Input value={p.coverage} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, coverage: e.target.value }; update({ products: ps }); }} /></Field></div>
                      <div className="md:col-span-1"><Field label="$/mo"><NumInput value={p.monthly} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, monthly: e.target.value }; update({ products: ps }); }} /></Field></div>
                      <div className="md:col-span-1"><Field label="$/yr"><NumInput value={p.annual} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, annual: e.target.value }; update({ products: ps }); }} /></Field></div>
                      <div className="md:col-span-4"><Field label="Projected returns note" hint={p.key==="ASCC" && p.cciOption !== "100" ? "Tip: returns note only applies to the Age 100 (whole-of-life) option" : ""}>
                        <Input value={p.returns} onChange={e => { const ps = [...client.products]; ps[i] = { ...p, returns: e.target.value }; update({ products: ps }); }} placeholder={p.key==="ASCC" && p.cciOption !== "100" ? "No returns for term options" : ""} disabled={p.key==="ASCC" && p.cciOption !== "100"} />
                      </Field></div>
                    </div>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Images for this plan (appear in report after this plan's explanation)</span>
                        <label className="text-xs text-purple-700 hover:underline cursor-pointer font-semibold">+ Upload<input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                          const files = Array.from(e.target.files);
                          files.forEach(file => {
                            const reader = new FileReader();
                            reader.onload = ev => {
                              const ps = [...client.products];
                              ps[i] = { ...ps[i], planImages: [...(ps[i].planImages||[]), { id: uid(), name: file.name, dataUrl: ev.target.result, caption: "" }] };
                              update({ products: ps });
                            };
                            reader.readAsDataURL(file);
                          });
                          e.target.value = "";
                        }} /></label>
                      </div>
                      {(p.planImages||[]).length === 0 && <div className="text-xs text-slate-400">No images yet — upload diagrams, condition lists, or benefit illustrations to include after this plan's explanation in the report.</div>}
                      {(p.planImages||[]).length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {(p.planImages||[]).map((img, j) => (
                            <div key={img.id} className="border border-slate-200 rounded-lg overflow-hidden">
                              <img src={img.dataUrl} alt={img.name} className="w-full h-20 object-contain bg-slate-50" />
                              <div className="p-1.5">
                                <Input value={img.caption} onChange={e => { const ps=[...client.products]; const imgs=[...(ps[i].planImages||[])]; imgs[j]={...img,caption:e.target.value}; ps[i]={...ps[i],planImages:imgs}; update({products:ps}); }} placeholder="Caption (optional)" className="text-xs" />
                                <button onClick={() => { const ps=[...client.products]; ps[i]={...ps[i],planImages:(ps[i].planImages||[]).filter((_,k)=>k!==j)}; update({products:ps}); }} className="text-red-500 text-xs mt-1">Remove</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">Each selected plan automatically brings its full explanation page (from your product library) into the report.</p>
          </SectionCard>
        </>)}

        {step === 5 && (<>
          <SectionCard title="AI-drafted narrative" right={
            <button onClick={runDraft} disabled={drafting} className="bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {drafting ? "Drafting…" : (client.narrative.exec ? "Re-draft with Claude" : "Draft with Claude")}
            </button>}>
            <p className="text-sm text-slate-500 mb-4">Claude drafts from the client's numbers, your priorities list, your concern notes, and the selected plans — in a warm, non-salesy tone. Review and edit everything before previewing; this is your professional advice, the draft is just a head start.</p>
            <Field label="1. Executive summary"><TextArea rows={9} value={client.narrative.exec} onChange={e => updateDeep("narrative", { exec: e.target.value })} /></Field>
            <div className="h-4" />
            <Field label="4. Recommendation narrative"><TextArea rows={10} value={client.narrative.recoIntro} onChange={e => updateDeep("narrative", { recoIntro: e.target.value })} /></Field>
            <div className="h-4" />
            <Field label="Action plan (numbered)"><TextArea rows={8} value={client.narrative.actionPlan} onChange={e => updateDeep("narrative", { actionPlan: e.target.value })} /></Field>
          </SectionCard>
          <SectionCard title="Report sections to include">
            {[["hierarchy", "Hierarchy of Needs in Financial Planning"], ["education", "Education sections 1.1–1.7 (money, FDs, insurance, investing…)"], ["allocation", "4-3-2-1 allocation table"], ["ratios", "Financial ratio analysis"]].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" checked={client.sections[k]} onChange={e => updateDeep("sections", { [k]: e.target.checked })} className="w-4 h-4 accent-purple-700" /> {label}
              </label>
            ))}
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={() => { persist(); setView("report"); }} className="bg-purple-900 hover:bg-purple-950 text-white font-semibold px-6 py-3 rounded-xl">Preview &amp; print report →</button>
          </div>
        </>)}
      </main>
    </div>
  );
}
