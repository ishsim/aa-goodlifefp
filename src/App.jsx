import React, { useState, useEffect, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, LabelList } from "recharts";
import logoAsset from "./assets/goodlife-logo.png.asset.json";
import { generateDocx } from "@/lib/generateDocx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { User, Wallet, Scale, Target, Shield, ClipboardList, LayoutDashboard, FileText, Save, Eye, Download, ChevronLeft, ChevronRight, Share2 } from "lucide-react";

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
// immutably set a value at a dot path (numeric segments address array indices), e.g.
// setDeep(obj, "savingsMaturity.0.age", "55") clones just the touched branch
const setDeep = (obj, path, value) => {
  const [key, ...rest] = path.split(".");
  const isIdx = /^\d+$/.test(key);
  if (rest.length === 0) {
    if (isIdx) { const arr = Array.isArray(obj) ? [...obj] : []; arr[Number(key)] = value; return arr; }
    return { ...(obj || {}), [key]: value };
  }
  if (isIdx) { const arr = Array.isArray(obj) ? [...obj] : []; arr[Number(key)] = setDeep(arr[Number(key)], rest.join("."), value); return arr; }
  const base = obj || {};
  return { ...base, [key]: setDeep(base[key], rest.join("."), value) };
};
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
  name: "", dob: "", occupation: "", occDetails: "", email: "", meetingDate: "", riskProfile: "",
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
  retirementAge: "60",
  incomeReplacement: { monthly: "", years: "", covDeath: "", covMCI: "", covECI: "", covAccident: "" },
  retirement: { monthly: "5000", years: "20", yearsToRetire: "25", inflation: "2.5", spkProj: "", spkAnnuityMonthly: "", spkAnnuityYears: "15", pension: "", annuities: { current: "", contrib: "", rate: "", years: "" }, investments: { current: "", contrib: "", rate: "", years: "" } },
  otherObjectives: [],
  existingPlans: [],
  existingInvestments: [],
  insuranceNeedsOverrides: {},
  insuranceDetailTables: {},
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
  if (!Array.isArray(m.existingPlans)) m.existingPlans = [];
  if (!Array.isArray(m.existingInvestments)) m.existingInvestments = [];
  // "GPP (steps down)" was renamed to "Whole Life"
  m.existingPlans = m.existingPlans.map(p => p.planType === "GPP (steps down)" ? { ...p, planType: "Whole Life" } : p);
  // "Allocation $/mo" became an amount + frequency pair
  m.existingPlans = m.existingPlans.map(p => (p.monthly != null && p.allocation == null) ? { ...p, allocation: p.monthly, allocationFreq: "monthly" } : p);
  // "Investment" plan type/category was removed from Existing Plans — move those rows into Existing Investment Portfolio instead
  const movedInvestments = m.existingPlans.filter(p => p.category === "Investment" || p.planType === "Investment");
  if (movedInvestments.length) {
    m.existingPlans = m.existingPlans.filter(p => !(p.category === "Investment" || p.planType === "Investment"));
    m.existingInvestments = [
      ...m.existingInvestments,
      ...movedInvestments.map(p => ({
        id: p.id || uid(), type: "Other", description: p.planName || p.planType || "Investment plan",
        insured: p.insured || "self", owner: "self", startAge: p.fromAge || "",
        currentValue: p.coverage || "", allocation: p.allocation || p.monthly || "", allocationFreq: p.allocationFreq || "monthly",
        notes: p.notes || "",
      })),
    ];
  }
  // Investment rows: "Monthly $" became allocation + frequency, and the flat return-scenario
  // list became rate groups, each with a repeatable list of projection-year horizons
  m.existingInvestments = m.existingInvestments.map(r => {
    let row = r;
    if (row.monthlyContribution != null && row.allocation == null) row = { ...row, allocation: row.monthlyContribution, allocationFreq: "monthly" };
    if (!Array.isArray(row.returnRates)) {
      let flat = Array.isArray(row.scenarios) ? row.scenarios : [];
      if (!flat.length && (row.returnRate != null || row.projectionYears != null || row.projectedValueOverride != null)) {
        flat = [{ rate: row.returnRate || "", years: row.projectionYears || "", projectedValueOverride: row.projectedValueOverride || "" }];
      }
      const groups = [];
      flat.forEach(sc => {
        const key = String(sc.rate ?? "");
        let g = groups.find(g => g.rate === key);
        if (!g) { g = { id: uid(), rate: key, horizons: [] }; groups.push(g); }
        g.horizons.push({ id: uid(), years: sc.years || "", projectedValueOverride: sc.projectedValueOverride || "" });
      });
      row = { ...row, returnRates: groups };
    }
    return row;
  });
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

// ---------- storage (Supabase) ----------
async function loadClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) { console.error("load failed", error); throw error; }
  return (data || []).map(row => migrate(row.data));
}
async function saveClient(c) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { console.error("save failed: no user"); return false; }
  const emailNorm = String(c.email || "").trim().toLowerCase() || null;
  const { error } = await supabase
    .from("clients")
    .upsert({
      id: c.id,
      data: c,
      user_id: user.id,
      client_email: emailNorm,
      updated_at: new Date(c.updated || Date.now()).toISOString(),
    }, { onConflict: "id" });
  if (error) { console.error("save failed", error); return false; }
  return true;
}
async function deleteClientRow(id) {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) { console.error("delete failed", error); throw error; }
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
    { id: "liqNW", name: "Liquid Assets to Net Worth", value: netWorth > 0 ? cash / netWorth : null, negNW: netWorth <= 0, target: 0.15, dir: ">=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Cash & cash equivalents ÷ net worth — how accessible your net worth is for short-term cash needs. Recommended: at least 15%." },
    { id: "savings", name: "Savings Ratio", value: net > 0 ? groupTotals.savings / net : null, target: 0.2, dir: ">=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Savings ÷ monthly take-home income. Recommended: save at least 20% of income toward future financial needs." },
    { id: "debtAsset", name: "Debt to Assets", value: totalAssets > 0 ? totalLiab / totalAssets : null, target: 0.5, dir: "<=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Total liabilities ÷ total assets — how much of your assets remain mortgaged to financial institutions. Recommended: below 50%." },
    { id: "debtService", name: "Debt Service Ratio", value: net > 0 ? monthlyDebt / net : null, target: 0.35, dir: "<=", fmtV: v => fmt(v * 100, 1) + "%",
      desc: "Monthly debt repayments ÷ take-home income — your ability to service debt. Recommended: below 35%." },
    { id: "investNW", name: "Invested Assets to Net Worth", value: netWorth > 0 ? invested / netWorth : null, negNW: netWorth <= 0, target: 0.5, dir: ">=", fmtV: v => fmt(v * 100, 1) + "%",
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
  // target retirement age (profile) drives the default planning horizons
  const age = num(calcAge(c.dob));
  const retAge = num(c.retirementAge);
  const yearsToRet = age > 0 && retAge > age ? retAge - age : (num(c.retirement.yearsToRetire) || 25);
  const ir = c.incomeReplacement;
  // defaults: income to replace = net income/month; years = until target retirement age
  const irMonthly = num(ir.monthly) > 0 ? num(ir.monthly) : net;
  const irYears = num(ir.years) > 0 ? num(ir.years) : yearsToRet;
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
  const rtAdjusted = rtRequired * Math.pow(1 + num(rt.inflation) / 100, yearsToRet);
  const spkAnnuityTotal = num(rt.spkAnnuityMonthly) > 0 ? num(rt.spkAnnuityMonthly) * 12 * num(rt.spkAnnuityYears) : num(rt.spkAnnuityLegacy);
  const annTotal = projectFV(rt.annuities || {}, yearsToRet);
  const invTotal = projectFV(rt.investments || {}, yearsToRet);
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
  const ratioBars = ratios.filter(r => r.id !== "liquidity").map(r => {
    const na = r.value == null;
    const actualPct = na ? 0 : r.value * 100;
    // keep a sliver of bar even at 0 so recharts renders the bar and its label
    const displayYours = Math.min(100, Math.max(0.8, actualPct));
    return {
      id: r.id,
      name: r.name,
      shortName: r.name.replace(/ \(.*\)/, "").replace("Invested Assets to Net Worth", "Invested/NW").replace("Liquid Assets to Net Worth", "Liquid/NW"),
      pass: r.pass, dir: r.dir, na, negNW: !!r.negNW,
      actualYours: actualPct,
      displayYours,
      displayTarget: Math.min(100, r.target * 100),
      yoursLabel: na ? (r.negNW ? "n/a" : "n/a") : fmt(actualPct, 1) + "%",
    };
  });
  const pie = [
    { name: "Loans / big purchases", value: groupTotals.loans },
    { name: "Expenditures", value: groupTotals.expenditures },
    { name: "Savings / investments", value: groupTotals.savings },
    { name: "Protection", value: groupTotals.protection },
    { name: "Unallocated (surplus)", value: Math.max(0, surplus) },
  ].filter(x => x.value > 0);
  return { gross, spk, net, groupTotals, totalExpenses, surplus, invested, investedFuture, cash, personal,
    totalAssets, totalLiab, netWorth, monthlyDebt, ratios, alloc, ef3, ef6, pie, assetPie, ratioBars,
    potentialIncome, irRows, irMonthly, irYears, age, retAge, yearsToRet, rtRequired, rtAdjusted, rtProjected, rtShortfall, rtMonthlyAnnuity, spkAnnuityTotal, annTotal, invTotal, selected, premMonthly, premAnnual };
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

const RatioBars = ({ data, height = 340 }) => (
  <div style={{ width: "100%", height, paddingTop: 40 }}>
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 0, bottom: 4 }}>
        <XAxis dataKey="shortName" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={64} />
        <YAxis tick={{ fontSize: 10 }} domain={[0, 105]} ticks={[0,25,50,75,100]} tickFormatter={(v) => v + "%"} />
        <Tooltip formatter={(v, n, p) => {
          if (n === "Yours") {
            const item = p && p.payload;
            return [item ? item.yoursLabel : fmt(v, 1) + "%", "Yours"];
          }
          return [fmt(v, 0) + "%", n];
        }} />
        <Legend wrapperStyle={{ fontSize: 11, width: "100%", paddingTop: 4 }} payload={[
          { value: "Benchmark", type: "square", color: "#cbd5e1" },
          { value: "Yours (healthy)", type: "square", color: "#16a34a" },
          { value: "Needs attention", type: "square", color: "#dc2626" },
        ]} />
        <Bar dataKey="displayTarget" name="Benchmark" fill="#cbd5e1" radius={[3,3,0,0]}>
          <LabelList dataKey="displayTarget" position="top" style={{ fontSize: 9, fill: "#64748b" }} formatter={(v) => fmt(v, 0) + "%"} />
        </Bar>
        <Bar dataKey="displayYours" name="Yours (healthy)" fill="#16a34a" radius={[3,3,0,0]}>
          {data.map((e, i) => <Cell key={i} fill={e.na ? "#94a3b8" : (e.pass ? "#16a34a" : "#dc2626")} />)}
          <LabelList dataKey="shortName" content={(props) => {
            const { x, y, width, value } = props;
            // recharts skips zero-height bars when numbering labels, so props.index
            // cannot be trusted — resolve the row from the label value instead
            const item = data.find(d => d.shortName === value);
            if (!item) return null;
            const inside = item.actualYours >= 100;
            const cx = Number(x) + Number(width) / 2;
            const cy = inside ? Number(y) + 12 : Number(y) - 4;
            return (
              <text x={cx} y={cy} textAnchor="middle" fontSize={10} fontWeight={600} fill={inside ? "#ffffff" : (item.na ? "#64748b" : (item.pass ? "#166534" : "#b91c1c"))}>
                {item.yoursLabel}
              </text>
            );
          }} />
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
    // a full circle degenerates the arc (start == end) — pull the end back a hair
    const a1 = Math.min((acc / total) * 2 * Math.PI, 2 * Math.PI - 0.0001) - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x0, y0] = p(a0, r), [x1, y1] = p(a1, r), [x2, y2] = p(a1, rin), [x3, y3] = p(a0, rin);
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rin} ${rin} 0 ${large} 0 ${x3} ${y3} Z`;
  };
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
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
    <svg width="100%" viewBox={`0 0 ${totalW} ${totalH}`} style={{ maxWidth: totalW, fontFamily: "inherit", display: "block", margin: "0 auto" }}>
      {/* Y axis lines & labels */}
      {yLines.map(({y, label}) => (
        <g key={label}>
          <line x1={axisW} y1={y + 4} x2={totalW} y2={y + 4} stroke="#e2e8f0" strokeWidth="1" />
          <text x={axisW - 4} y={y + 8} fontSize="8" textAnchor="end" fill="#94a3b8">{label}</text>
        </g>
      ))}
      {/* Groups */}
      {data.map((d, i) => {
        const benchVal = d.displayTarget;
        const yoursRaw = d.actualYours;
        const yoursVal = d.displayYours;
        const inside = yoursRaw >= 100;
        const x0 = axisW + gutter + i * (groupW + gutter);
        const benchH = chartH - yScale(benchVal);
        const yoursH = Math.max(2, chartH - yScale(yoursVal));
        const benchY = yScale(benchVal) + 4;
        const yoursY = yScale(yoursVal) + 4;
        const barColor = d.na ? "#94a3b8" : (d.pass ? "#16a34a" : "#dc2626");
        const labelY = chartH + labelH + 4;
        return (
          <g key={i}>
            {/* Benchmark bar */}
            <rect x={x0} y={benchY} width={barW} height={benchH} fill="#cbd5e1" rx="2" />
            {/* Yours bar */}
            <rect x={x0 + barW + gap} y={yoursY} width={barW} height={yoursH} fill={barColor} rx="2" />
            {/* Value label above yours bar */}
            <text x={x0 + barW + gap + barW / 2} y={inside ? yoursY + 10 : yoursY - 3} fontSize="8" textAnchor="middle" fill={inside ? "#ffffff" : barColor} fontWeight="600">{d.yoursLabel}</text>
            {/* Group label */}
            <foreignObject x={x0 - 4} y={chartH + 10} width={groupW + 8} height={labelH - 6}>
              <div xmlns="http://www.w3.org/1999/xhtml" style={{fontSize:8.5,textAlign:"center",color: d.na ? "#64748b" : (d.pass ? "#475569" : "#b91c1c"),lineHeight:1.3,wordBreak:"break-word"}}>
                {d.shortName} {d.na ? "" : (d.pass ? "✓" : "⚠")}
              </div>
            </foreignObject>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={axisW} y={totalH - legendH + 4} width={12} height={10} fill="#cbd5e1" rx="2" />
      <text x={axisW + 16} y={totalH - legendH + 13} fontSize="9" fill="#64748b">Benchmark</text>
      <rect x={axisW + 100} y={totalH - legendH + 4} width={12} height={10} fill="#16a34a" rx="2" />
      <text x={axisW + 116} y={totalH - legendH + 13} fontSize="9" fill="#64748b">Yours (healthy)</text>
      <rect x={axisW + 230} y={totalH - legendH + 4} width={12} height={10} fill="#dc2626" rx="2" />
      <text x={axisW + 246} y={totalH - legendH + 13} fontSize="9" fill="#64748b">Needs attention</text>
    </svg>
  );
};

// Life timeline for the report's Concerns & Objectives section. The x-axis is
// calendar time expressed as the client's age; each dependent gets their own
// lane below, running concurrently — reading straight down from any marker
// shows how old everyone is at that moment. Axes end in an arrow, not a tick,
// so age is never capped.
const LifeTimeline = ({ client }) => {
  const nowAge = num(calcAge(client.dob));
  if (!nowAge) return null;
  const retireAge = num(client.retirementAge) > nowAge ? num(client.retirementAge) : nowAge + num(client.retirement.yearsToRetire);
  const deps = (client.dependents || [])
    .filter(dep => dep.dob && calcAge(dep.dob) !== "")
    .map(dep => ({ name: dep.name || "Dependent", age: num(calcAge(dep.dob)) }));
  const checkpoints = [70, 80, 90].filter(a => a > retireAge && a > nowAge);
  const maxMark = Math.max(90, retireAge, nowAge);
  const W = 700, axisY = 56, laneGap = 36, x0 = 24, x1 = 640; // lines continue past x1 into the arrows
  const H = axisY + 26 + deps.length * laneGap + (deps.length ? 14 : 0);
  const x = (age) => x0 + (age / (maxMark + 8)) * (x1 - x0);
  const depAgeAt = (dep, clientAge) => dep.age + (clientAge - nowAge);
  const lanesBottom = axisY + deps.length * laneGap;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, fontFamily: "inherit", display: "block", margin: "0 auto" }}>
      <defs>
        <marker id="lt-arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0 0 L9 4 L0 8 Z" fill="#94a3b8" />
        </marker>
        <marker id="lt-arrow-lt" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0 0 L9 4 L0 8 Z" fill="#cbd5e1" />
        </marker>
      </defs>
      {/* "today" and retirement guides running through every lane */}
      {deps.length > 0 && <line x1={x(nowAge)} y1={axisY} x2={x(nowAge)} y2={lanesBottom} stroke={BRAND.primary} strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />}
      {deps.length > 0 && <line x1={x(retireAge)} y1={axisY} x2={x(retireAge)} y2={lanesBottom} stroke="#d97706" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />}
      {/* client axis */}
      <line x1={x0} y1={axisY} x2={W - 14} y2={axisY} stroke="#94a3b8" strokeWidth="2" markerEnd="url(#lt-arrow)" />
      {deps.length === 0 && <text x={W - 14} y={axisY + 20} fontSize="9" textAnchor="end" fill="#94a3b8" fontStyle="italic">age</text>}
      <g>
        <circle cx={x(nowAge)} cy={axisY} r="6" fill={BRAND.primary} />
        <line x1={x(nowAge)} y1={axisY - 6} x2={x(nowAge)} y2={axisY - 22} stroke={BRAND.primary} strokeWidth="1" />
        <text x={x(nowAge)} y={axisY - 27} fontSize="10" textAnchor="middle" fill={BRAND.primary} fontWeight="700">You today — {nowAge}</text>
      </g>
      <g>
        <rect x={x(retireAge) - 5} y={axisY - 5} width="10" height="10" transform={`rotate(45 ${x(retireAge)} ${axisY})`} fill="#d97706" />
        <line x1={x(retireAge)} y1={axisY - 7} x2={x(retireAge)} y2={axisY - 40} stroke="#d97706" strokeWidth="1" />
        <text x={x(retireAge)} y={axisY - 45} fontSize="10" textAnchor="middle" fill="#b45309" fontWeight="700">Retirement — {retireAge}</text>
      </g>
      {checkpoints.map(a => (
        <g key={a}>
          <line x1={x(a)} y1={axisY - 6} x2={x(a)} y2={axisY + 6} stroke="#64748b" strokeWidth="1.5" />
          <text x={x(a)} y={axisY - 12} fontSize="9" textAnchor="middle" fill="#64748b" fontWeight="600">{a}</text>
        </g>
      ))}
      {/* one concurrent lane per dependent */}
      {deps.map((dep, i) => {
        const y = axisY + (i + 1) * laneGap;
        const birthX = Math.max(x0, x(nowAge - dep.age));
        return (
          <g key={"d" + i}>
            <line x1={birthX} y1={y} x2={W - 14} y2={y} stroke="#cbd5e1" strokeWidth="1.5" markerEnd="url(#lt-arrow-lt)" />
            <circle cx={x(nowAge)} cy={y} r="4" fill="#2563eb" />
            <text x={x(nowAge) - 9} y={y + 3} fontSize="9" textAnchor="end" fill="#1d4ed8" fontWeight="600">{dep.name} — {dep.age}</text>
            {/* their age when the client retires and at each checkpoint */}
            <text x={x(retireAge)} y={y - 6} fontSize="8.5" textAnchor="middle" fill="#b45309">{depAgeAt(dep, retireAge)}</text>
            {checkpoints.map(a => (
              <text key={a} x={x(a)} y={y - 6} fontSize="8.5" textAnchor="middle" fill="#94a3b8">{depAgeAt(dep, a)}</text>
            ))}
            {/* coming-of-age milestones: when this dependent turns 18 and 21 */}
            {[18, 21].filter(m => dep.age < m).map(m => {
              const clientAgeThen = nowAge + (m - dep.age);
              if (clientAgeThen > maxMark + 6) return null;
              return (
                <g key={"m" + m}>
                  <line x1={x(clientAgeThen)} y1={y - 4} x2={x(clientAgeThen)} y2={y + 4} stroke="#059669" strokeWidth="1.5" />
                  <text x={x(clientAgeThen)} y={y + 15} fontSize="8.5" textAnchor="middle" fill="#059669" fontWeight="700">{m}</text>
                </g>
              );
            })}
            {i === deps.length - 1 && <text x={W - 14} y={y + 16} fontSize="9" textAnchor="end" fill="#94a3b8" fontStyle="italic">age</text>}
          </g>
        );
      })}
    </svg>
  );
};

const StaticEmergencyFund = ({ months, cash, ef3, ef6, pct3, pct6, pass3, pass6 }) => {
  const W = 560, rowH = 48, top = 26;
  const H = top + rowH * 2;
  const rows = [
    { label: "3-Month Target: " + money(ef3), pct: pct3, pass: pass3, short: Math.max(0, ef3 - cash) },
    { label: "6-Month Target: " + money(ef6), pct: pct6, pass: pass6, short: Math.max(0, ef6 - cash) },
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, fontFamily: "inherit", display: "block", margin: "0 auto" }}>
      <text x={0} y={12} fontSize="10" fontWeight="600" fill="#64748b" letterSpacing="1.5">{"EMERGENCY FUND — " + fmt(months, 1) + " MONTHS OF EXPENSES"}</text>
      {rows.map((r, i) => {
        const y = top + i * rowH;
        return (
          <g key={i}>
            <text x={0} y={y + 10} fontSize="10" fill="#475569">{r.label}</text>
            <text x={W} y={y + 10} fontSize="10" textAnchor="end" fontWeight="600" fill={r.pass ? "#7e22ce" : "#dc2626"}>{r.pass ? "✓ Met" : "⚠ Shortfall " + money(r.short)}</text>
            <rect x={0} y={y + 16} width={W} height={12} rx="6" fill="#f1f5f9" />
            <rect x={0} y={y + 16} width={Math.max(8, W * Math.min(100, r.pct) / 100)} height={12} rx="6" fill={r.pass ? "#9333ea" : "#ef4444"} />
          </g>
        );
      })}
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

// ---------- Current Coverage editor ----------
// "Investment" plan type/category was removed — those entries belong in the
// Existing Investment Portfolio section instead (see migrate()).
const EXISTING_PLAN_TYPES = ["Insurance Plan", "Whole Life", "Retirement Annuity", "SPK", "Solitaire PA"];
const EXISTING_PLAN_CATEGORIES = ["Death, Disability & Critical Illness", "Death & Disability", "Critical Illness", "Personal Accident", "Hospital Stay", "Retirement", "Child Savings", "Others"];
// gap categories checked for dependents on the Overview — retirement/child-savings/others aren't flagged as "missing" for a child
const DEPENDENT_GAP_CATEGORIES = ["Death & Disability", "Critical Illness", "Personal Accident", "Hospital Stay"];
const INVESTMENT_TYPES = ["Unit Trust", "Stocks/Shares", "Fixed Deposit", "Savings Account", "Property", "Cash", "Other"];
// intentionally overlaps EXISTING_PLAN_CATEGORIES (e.g. "Retirement", "Child Savings") so an
// investment tagged the same way merges into that category's row on the Overview timeline
const INVESTMENT_CATEGORIES = ["Investment Portfolio", "Retirement", "Child Savings", "Education", "Emergency Fund", "Property", "Others"];
const ALLOCATION_FREQS = [["monthly", "Monthly", 12], ["quarterly", "Quarterly", 4], ["semiannual", "Semi-annual", 2], ["annual", "Annual", 1]];
const freqLabel = (freq) => (ALLOCATION_FREQS.find(f => f[0] === freq) || ALLOCATION_FREQS[0])[1];
const freqMonthlyEquiv = (amt, freq) => { const per = (ALLOCATION_FREQS.find(f => f[0] === freq) || ALLOCATION_FREQS[0])[2]; return num(amt) * per / 12; };

function Collapsible({ title, defaultOpen = true, right, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 text-slate-800 font-semibold">
          <span className="text-slate-400">{open ? "▾" : "▸"}</span>{title}
        </button>
        {right}
      </div>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
}

function ExistingPlanRow({ row, onChange, onRemove, dependents = [] }) {
  const [adv, setAdv] = useState(false);
  const set = (k, v) => onChange({ ...row, [k]: v });
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Plan type</label>
          <select value={row.planType || ""} onChange={e => set("planType", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Select…</option>
            {EXISTING_PLAN_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Plan name</label>
          <Input value={row.planName || ""} onChange={e => set("planName", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Policy number</label>
          <Input value={row.policyNumber || ""} onChange={e => set("policyNumber", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Category</label>
          <select value={row.category || ""} onChange={e => set("category", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Select…</option>
            {EXISTING_PLAN_CATEGORIES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Insured</label>
          <select value={row.insured || "self"} onChange={e => set("insured", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="self">Self</option>
            {dependents.map(dep => <option key={dep.id} value={dep.id}>{dep.name || "(unnamed)"}{dep.relationship ? " (" + dep.relationship + ")" : ""}</option>)}
          </select>
        </div>
        <div className="col-span-1 flex items-end justify-end">
          <button onClick={onRemove} className="text-red-500 text-sm">✕</button>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Coverage $</label>
          <NumInput value={row.coverage || ""} onChange={e => set("coverage", e.target.value)} />
        </div>
        <div className="col-span-1">
          <label className="text-xs text-slate-500">From age</label>
          <NumInput value={row.fromAge || ""} onChange={e => set("fromAge", e.target.value)} />
        </div>
        <div className="col-span-1">
          <label className="text-xs text-slate-500">To age</label>
          <NumInput value={row.toAge || ""} onChange={e => set("toAge", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Allocation $</label>
          <NumInput value={row.allocation || ""} onChange={e => set("allocation", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Frequency</label>
          <select value={row.allocationFreq || "monthly"} onChange={e => set("allocationFreq", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            {ALLOCATION_FREQS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Premium ends age</label>
          <NumInput value={row.premiumEndsAge || ""} onChange={e => set("premiumEndsAge", e.target.value)} />
        </div>
        <div className="col-span-2 flex items-end">
          <button onClick={() => setAdv(a => !a)} className="text-xs text-purple-700 hover:underline">{adv ? "− Hide advanced" : "+ Advanced"}</button>
        </div>
        {adv && <>
          <div className="col-span-3">
            <label className="text-xs text-slate-500">Step-down age</label>
            <NumInput value={row.stepDownAge || ""} onChange={e => set("stepDownAge", e.target.value)} />
          </div>
          <div className="col-span-3">
            <label className="text-xs text-slate-500">Step-down amount $</label>
            <NumInput value={row.stepDownAmount || ""} onChange={e => set("stepDownAmount", e.target.value)} />
          </div>
        </>}
      </div>
    </div>
  );
}

function ExistingInvestmentRow({ row, onChange, onRemove, dependents = [], clientAge = null }) {
  const set = (k, v) => onChange({ ...row, [k]: v });
  const rates = row.returnRates || [];
  const monthlyEquiv = freqMonthlyEquiv(row.allocation, row.allocationFreq);
  const insuredAge = (() => {
    if (!row.insured || row.insured === "self") return clientAge;
    const dep = dependents.find(d => d.id === row.insured);
    return dep && dep.dob && calcAge(dep.dob) !== "" ? num(calcAge(dep.dob)) : null;
  })();
  const setRates = (next) => set("returnRates", next);
  const setRate = (gi, k, v) => setRates(rates.map((g, i) => i === gi ? { ...g, [k]: v } : g));
  const addRate = () => setRates([...rates, { id: uid(), rate: "", horizons: [{ id: uid(), years: "", projectedValueOverride: "" }] }]);
  const removeRate = (gi) => setRates(rates.filter((_, i) => i !== gi));
  const setHorizon = (gi, hi, k, v) => setRates(rates.map((g, i) => i !== gi ? g : { ...g, horizons: g.horizons.map((h, j) => j === hi ? { ...h, [k]: v } : h) }));
  const addHorizon = (gi) => setRates(rates.map((g, i) => i !== gi ? g : { ...g, horizons: [...g.horizons, { id: uid(), years: "", projectedValueOverride: "" }] }));
  const removeHorizon = (gi, hi) => setRates(rates.map((g, i) => i !== gi ? g : { ...g, horizons: g.horizons.filter((_, j) => j !== hi) }));
  const ownerOptions = (key) => (
    <select value={row[key] || "self"} onChange={e => set(key, e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
      <option value="self">Self</option>
      {dependents.map(dep => <option key={dep.id} value={dep.id}>{dep.name || "(unnamed)"}{dep.relationship ? " (" + dep.relationship + ")" : ""}</option>)}
    </select>
  );
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Type</label>
          <select value={row.type || ""} onChange={e => set("type", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Select…</option>
            {INVESTMENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Description</label>
          <Input value={row.description || ""} onChange={e => set("description", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Category</label>
          <select value={row.category || ""} onChange={e => set("category", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Select…</option>
            {INVESTMENT_CATEGORIES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Insured</label>
          {ownerOptions("insured")}
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Policy owner</label>
          {ownerOptions("owner")}
        </div>
        <div className="col-span-1 flex items-end justify-end">
          <button onClick={onRemove} className="text-red-500 text-sm">✕</button>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Age started</label>
          <NumInput value={row.startAge || ""} onChange={e => set("startAge", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">To age</label>
          <NumInput value={row.toAge || ""} onChange={e => set("toAge", e.target.value)} placeholder="e.g. 100" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Current value $</label>
          <NumInput value={row.currentValue || ""} onChange={e => set("currentValue", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Allocation $</label>
          <NumInput value={row.allocation || ""} onChange={e => set("allocation", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Frequency</label>
          <select value={row.allocationFreq || "monthly"} onChange={e => set("allocationFreq", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            {ALLOCATION_FREQS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Pay until age</label>
          <NumInput value={row.payUntilAge || ""} onChange={e => set("payUntilAge", e.target.value)} />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 font-semibold">Projected returns — group by rate, then add a year for each horizon</label>
          <button onClick={addRate} className="text-xs text-purple-700 hover:underline">+ Add rate</button>
        </div>
        {rates.length === 0 && <div className="text-xs text-slate-400 mb-2">No return assumptions yet — add a rate to project this investment's growth.</div>}
        <div className="space-y-2">
          {rates.map((g, gi) => (
            <div key={g.id || gi} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-end gap-2 mb-2">
                <div className="w-32">
                  <label className="text-xs text-slate-500">Return % p.a.</label>
                  <NumInput value={g.rate || ""} onChange={e => setRate(gi, "rate", e.target.value)} placeholder="e.g. 6" />
                </div>
                <button onClick={() => addHorizon(gi)} className="text-xs text-purple-700 hover:underline mb-1.5">+ Add year</button>
                <div className="flex-1" />
                <button onClick={() => removeRate(gi)} className="text-red-500 text-sm mb-1.5">✕ Remove rate</button>
              </div>
              <div className="space-y-1.5 pl-3 border-l-2 border-purple-100">
                {(g.horizons || []).map((h, hi) => {
                  const auto = projectFV({ current: row.currentValue, contrib: monthlyEquiv, rate: g.rate, years: h.years }, 0);
                  const projected = num(h.projectedValueOverride) > 0 ? num(h.projectedValueOverride) : auto;
                  return (
                    <div key={h.id || hi} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        <label className="text-xs text-slate-500">Projection years</label>
                        <NumInput value={h.years || ""} onChange={e => setHorizon(gi, hi, "years", e.target.value)} />
                        {insuredAge != null && num(h.years) > 0 && <div className="text-[10px] text-slate-400 mt-0.5">insured will be age {insuredAge + num(h.years)}</div>}
                      </div>
                      <div className="col-span-7">
                        <label className="text-xs text-slate-500">Projected value $ {auto > 0 ? "(auto: " + money(auto) + ")" : ""}</label>
                        <NumInput value={h.projectedValueOverride || ""} onChange={e => setHorizon(gi, hi, "projectedValueOverride", e.target.value)} placeholder={auto > 0 ? String(Math.round(auto)) : "auto-calculated"} />
                      </div>
                      <div className="col-span-2 flex items-end justify-end">
                        <button onClick={() => removeHorizon(gi, hi)} className="text-red-500 text-sm">✕</button>
                      </div>
                      {projected > 0 && <div className="col-span-12 text-[11px] text-slate-400 -mt-1">Projects to {money(projected)}{num(h.years) > 0 ? " in " + h.years + " years" : ""} — override if fees or a different scenario should apply.</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-2 mt-3">
        <div className="col-span-12">
          <label className="text-xs text-slate-500">Notes</label>
          <Input value={row.notes || ""} onChange={e => set("notes", e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function CurrentCoverageSection({ client, update }) {
  const plans = client.existingPlans || [];
  const invs = client.existingInvestments || [];
  return (
    <>
      <Collapsible
        title="Existing Insurance Plans"
        defaultOpen={true}
        right={<button onClick={() => update({ existingPlans: [...plans, { id: uid() }] })} className="text-sm text-purple-800 hover:underline">+ Add existing plan</button>}
      >
        {plans.length === 0 && <div className="text-sm text-slate-400">No existing plans added yet.</div>}
        <div className="space-y-3">
          {plans.map((row, i) => (
            <ExistingPlanRow
              key={row.id || i}
              row={row}
              dependents={client.dependents || []}
              onChange={next => { const l = [...plans]; l[i] = next; update({ existingPlans: l }); }}
              onRemove={() => update({ existingPlans: plans.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </Collapsible>
      <Collapsible
        title="Existing Investment Portfolio"
        defaultOpen={true}
        right={<button onClick={() => update({ existingInvestments: [...invs, { id: uid() }] })} className="text-sm text-purple-800 hover:underline">+ Add investment</button>}
      >
        {invs.length === 0 && <div className="text-sm text-slate-400">No investments added yet.</div>}
        <div className="space-y-3">
          {invs.map((row, i) => (
            <ExistingInvestmentRow
              key={row.id || i}
              row={row}
              dependents={client.dependents || []}
              clientAge={num(calcAge(client.dob))}
              onChange={next => { const l = [...invs]; l[i] = next; update({ existingInvestments: l }); }}
              onRemove={() => update({ existingInvestments: invs.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </Collapsible>
    </>
  );
}

const Stat = ({ label, value, accent, gold }) => (
  <div className={"rounded-lg px-4 py-3 " + (accent ? "bg-purple-900 text-white" : gold ? "bg-amber-100 border border-amber-400" : "bg-slate-50 border border-slate-200")}>
    <div className={"text-xs uppercase tracking-wide " + (accent ? "text-purple-200" : gold ? "text-amber-700" : "text-slate-500")}>{label}</div>
    <div className="text-lg font-semibold tabular-nums">{value}</div>
  </div>
);

// ---------- coverage timeline (Overview) ----------
const TIMELINE_MAX_AGE = 100;
// fallback coverage end ages for recommended products that carry no explicit endAge
const RECO_END_AGE = {
  GPP: () => 100,                              // whole life to age 100
  PA: (start) => Math.min(start + 20, 100),    // 20-year term-style cover
  MSCC: (start) => Math.min(start + 20, 100),
  HI: (start) => Math.min(start + 20, 100),
  STP: (start) => Math.min(start + 20, 100),   // level premium locked 20 years
  ILP: () => 65,
  RS: () => 75,                                // annuity payout 60–75
};
const INSURED_COLORS = ["#51037c", "#2563eb", "#059669", "#d97706", "#0891b2", "#be185d", "#65a30d", "#475569"];

// coverage $ totals per insured, grouped from Existing Plans' categories into the three
// points of coverage — a combined "Death, Disability & Critical Illness" plan counts
// toward both Life and Health, matching how such a plan actually pays out on either trigger
const NEEDS_TRIANGLE_GROUPS = [
  { key: "health", label: "Health Benefits", categories: ["Critical Illness", "Death, Disability & Critical Illness", "Hospital Stay"], corner: { x: 108, y: 96 } },
  { key: "life", label: "Life Protection", categories: ["Death & Disability", "Death, Disability & Critical Illness"], corner: { x: 352, y: 96 } },
  { key: "accident", label: "Accident Coverage", categories: ["Personal Accident"], corner: { x: 230, y: 344 } },
];

function InsuranceNeedsTriangle({ person, plans, overrides, setOverride }) {
  const autoTotal = (categories) => plans.filter(p => (p.insured || "self") === person.id && categories.includes(p.category)).reduce((s, p) => s + num(p.coverage), 0);
  const values = NEEDS_TRIANGLE_GROUPS.map(g => {
    const auto = autoTotal(g.categories);
    const raw = overrides[g.key];
    const isOverridden = raw != null && raw !== "";
    return { ...g, auto, value: isOverridden ? num(raw) : auto, isOverridden, raw };
  });
  const total = values.reduce((s, v) => s + v.value, 0);
  const W = 460, H = 440, CENTER = { x: 230, y: 214 }, R_CENTER = 58, R_CORNER = 48;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", margin: "0 auto", fontFamily: "inherit" }}>
      <polygon points={values.map(v => v.corner.x + "," + v.corner.y).join(" ")} fill="#f5f0fa" stroke="#d8b4fe" strokeWidth="2" />
      {values.map(v => <line key={v.key} x1={CENTER.x} y1={CENTER.y} x2={v.corner.x} y2={v.corner.y} stroke="#d8b4fe" strokeWidth="2" />)}
      <circle cx={CENTER.x} cy={CENTER.y} r={R_CENTER} fill={BRAND.primary} />
      <text x={CENTER.x} y={CENTER.y - 12} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" letterSpacing="0.03em">TOTAL</text>
      <text x={CENTER.x} y={CENTER.y + 1} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" letterSpacing="0.03em">INSURANCE</text>
      <text x={CENTER.x} y={CENTER.y + 14} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff" letterSpacing="0.03em">NEEDS</text>
      <text x={CENTER.x} y={CENTER.y + 32} textAnchor="middle" fontSize="10" fill="#e9d5ff">{money(total)}</text>
      {values.map(v => {
        // corners below the hub put their label under the whole node instead of above,
        // so it never collides with the center circle
        const below = v.corner.y > CENTER.y;
        const labelY = below ? v.corner.y + R_CORNER + 46 : v.corner.y - R_CORNER - 10;
        return (
        <g key={v.key}>
          <circle cx={v.corner.x} cy={v.corner.y} r={R_CORNER} fill="#fff" stroke={BRAND.primary} strokeWidth="2.5" />
          <text x={v.corner.x} y={labelY} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#3a1955">{v.label}</text>
          <text x={v.corner.x} y={v.corner.y - 10} textAnchor="middle" fontSize="8.5" fill={v.isOverridden ? "#b45309" : "#94a3b8"} fontStyle="italic">{v.isOverridden ? "edited" : "auto-total"}</text>
          <foreignObject x={v.corner.x - 42} y={v.corner.y - 2} width="84" height="26">
            <input
              type="number" inputMode="decimal" step="any"
              value={v.isOverridden ? v.raw : ""}
              placeholder={String(Math.round(v.auto))}
              onChange={e => setOverride(v.key, e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", textAlign: "center", fontSize: 11, border: "1px solid #c4b5fd", borderRadius: 6, padding: "3px 4px", fontFamily: "inherit" }}
            />
          </foreignObject>
          <text x={v.corner.x} y={v.corner.y + 34} textAnchor="middle" fontSize="9" fill="#7c3aed" fontWeight="600">{money(v.value)}</text>
        </g>
        );
      })}
    </svg>
  );
}

const TCell = ({ value, onChange, placeholder, align = "right" }) => (
  <input
    type="text"
    value={value || ""}
    onChange={onChange}
    placeholder={placeholder}
    className={"w-full bg-transparent text-xs px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400 rounded " + (align === "right" ? "text-right" : "text-left")}
  />
);

// four reference tables matching the client's own illustration format — Health Benefits
// (staged CI: Minor/Early/Major), Life Protection (Death/TPD) + Savings (Maturity /
// Premium Returns / Retirement income at chosen ages), and Accident Coverage
// (Major: Death/TPD, Minor: Hospital Expenses/Week Indemnity/Hospital Benefit).
// This granularity isn't captured by Existing Plans, so every cell is a plain manual entry.
function InsuranceNeedsDetailTables({ tables, setField }) {
  const t = tables || {};
  const th = "bg-purple-900 text-white text-center text-xs font-semibold px-2 py-1.5";
  const subhead = "border border-slate-200 px-2 py-1 text-xs font-semibold bg-slate-50";
  const td = "border border-slate-200 px-1 py-0.5";
  const ageValueRows = (groupKey, rows) => rows.map((label, i) => {
    const row = (t[groupKey] && t[groupKey][i]) || {};
    return (
      <tr key={i}>
        {i === 0 && <td className={td + " text-xs font-medium align-top"} rowSpan={rows.length}>{label}</td>}
        <td className={td}><TCell value={row.age} onChange={e => setField(groupKey + "." + i + ".age", e.target.value)} placeholder="@ age" align="left" /></td>
        <td className={td}><TCell value={row.value} onChange={e => setField(groupKey + "." + i + ".value", e.target.value)} placeholder="—" /></td>
      </tr>
    );
  });

  return (
    <div className="grid md:grid-cols-3 gap-4 items-start mt-3">
      <table className="w-full border-collapse h-fit">
        <thead>
          <tr><th className={th} colSpan={3}>Health Benefits</th></tr>
          <tr><th className={subhead + " text-center"}>Minor</th><th className={subhead + " text-center"}>Early</th><th className={subhead + " text-center"}>Major</th></tr>
        </thead>
        <tbody><tr>
          <td className={td}><TCell value={t.health?.minor} onChange={e => setField("health.minor", e.target.value)} placeholder="—" align="center" /></td>
          <td className={td}><TCell value={t.health?.early} onChange={e => setField("health.early", e.target.value)} placeholder="—" align="center" /></td>
          <td className={td}><TCell value={t.health?.major} onChange={e => setField("health.major", e.target.value)} placeholder="—" align="center" /></td>
        </tr></tbody>
      </table>

      <table className="w-full border-collapse h-fit">
        <thead><tr><th className={th} colSpan={2}>Accident Coverage</th></tr></thead>
        <tbody>
          <tr><td className={subhead} colSpan={2}>Major</td></tr>
          <tr><td className={td + " text-xs px-2"}>Death</td><td className={td}><TCell value={t.accidentMajor?.death} onChange={e => setField("accidentMajor.death", e.target.value)} placeholder="—" /></td></tr>
          <tr><td className={td + " text-xs px-2"}>TP Disability</td><td className={td}><TCell value={t.accidentMajor?.tpDisability} onChange={e => setField("accidentMajor.tpDisability", e.target.value)} placeholder="—" /></td></tr>
          <tr><td className={subhead} colSpan={2}>Minor</td></tr>
          <tr><td className={td + " text-xs px-2"}>Hospital Expenses</td><td className={td}><TCell value={t.accidentMinor?.hospitalExpenses} onChange={e => setField("accidentMinor.hospitalExpenses", e.target.value)} placeholder="—" /></td></tr>
          <tr><td className={td + " text-xs px-2"}>Week Indemnity</td><td className={td}><TCell value={t.accidentMinor?.weekIndemnity} onChange={e => setField("accidentMinor.weekIndemnity", e.target.value)} placeholder="—" /></td></tr>
          <tr><td className={td + " text-xs px-2"}>Hospital Benefit</td><td className={td}><TCell value={t.accidentMinor?.hospitalBenefit} onChange={e => setField("accidentMinor.hospitalBenefit", e.target.value)} placeholder="—" /></td></tr>
        </tbody>
      </table>

      <div className="space-y-3">
        <table className="w-full border-collapse">
          <thead><tr><th className={th} colSpan={2}>Life Protection</th></tr></thead>
          <tbody>
            <tr><td className={td + " text-xs px-2"}>Death</td><td className={td}><TCell value={t.life?.death} onChange={e => setField("life.death", e.target.value)} placeholder="—" /></td></tr>
            <tr><td className={td + " text-xs px-2"}>TP Disability</td><td className={td}><TCell value={t.life?.tpDisability} onChange={e => setField("life.tpDisability", e.target.value)} placeholder="—" /></td></tr>
          </tbody>
        </table>
        <table className="w-full border-collapse">
          <thead><tr><th className={th} colSpan={3}>Savings</th></tr></thead>
          <tbody>
            {ageValueRows("savingsMaturity", ["Maturity", "Maturity"]).slice(0, 2)}
            {ageValueRows("savingsPremiumReturns", ["Premium Returns", "Premium Returns"]).slice(0, 2)}
            {ageValueRows("savingsRetirementIncome", ["Retirement income"]).slice(0, 1)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InsuranceNeedsSummary({ client, update }) {
  const plans = client.existingPlans || [];
  const clientAge = num(calcAge(client.dob));
  const overrides = client.insuranceNeedsOverrides || {};
  const detailTables = client.insuranceDetailTables || {};
  const persons = useMemo(() => [
    { id: "self", name: client.name || "Client", age: clientAge || null },
    ...(client.dependents || []).map((dep, i) => ({
      id: dep.id, name: dep.name || "Dependent " + (i + 1),
      age: dep.dob && calcAge(dep.dob) !== "" ? num(calcAge(dep.dob)) : null,
    })),
  ].filter(p => p.id === "self" || plans.some(pl => (pl.insured || "self") === p.id)), [client.dependents, client.name, clientAge, plans]);

  const setOverride = (personId, key, v) => update({ insuranceNeedsOverrides: { ...overrides, [personId]: { ...(overrides[personId] || {}), [key]: v } } });
  const setTableField = (personId, path, v) => update({ insuranceDetailTables: { ...detailTables, [personId]: setDeep(detailTables[personId], path, v) } });

  return (
    <div>
      <p className="text-xs text-slate-500 mb-4">Summary of current in-force insurance plans as of {todayLong()} — the three points of coverage: Life, Accident and Health. Totals are calculated automatically from Existing Insurance Plans but every figure can be edited directly. Current value from Investment plans is not included here.</p>
      <div className="space-y-8">
        {persons.map(person => (
          <div key={person.id} className={persons.length > 1 ? "pb-6 border-b border-slate-100 last:border-0 last:pb-0" : ""}>
            <div className="font-semibold text-sm text-purple-900 mb-1 text-center">{person.name}{person.age != null ? " — age " + person.age : ""}</div>
            <InsuranceNeedsTriangle person={person} plans={plans} overrides={overrides[person.id] || {}} setOverride={(k, v) => setOverride(person.id, k, v)} />
            <InsuranceNeedsDetailTables tables={detailTables[person.id]} setField={(path, v) => setTableField(person.id, path, v)} />
          </div>
        ))}
        {persons.length === 0 && <div className="text-sm text-slate-400">Add existing plans in the Current Coverage step to see this summary.</div>}
      </div>
    </div>
  );
}

function CoverageTimelinePanel({ client }) {
  const [mode, setMode] = useState("current");
  const [win, setWin] = useState({ a0: 0, a1: TIMELINE_MAX_AGE }); // visible client-age window (zoom)
  const [hover, setHover] = useState(null);       // { item, left, top }
  const [selected, setSelected] = useState(null); // pinned item for the detail card
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const winRef = useRef(win); winRef.current = win;
  const clientAge = num(calcAge(client.dob));
  const retireAge = num(client.retirementAge); // from Profile (KYC) step

  // everyone a plan can insure: the client plus each dependent, each with a colour
  const insuredList = useMemo(() => [
    { id: "self", name: client.name || "Client", age: clientAge || null, color: INSURED_COLORS[0] },
    ...(client.dependents || []).map((dep, i) => ({
      id: dep.id, name: dep.name || "Dependent " + (i + 1),
      age: dep.dob && calcAge(dep.dob) !== "" ? num(calcAge(dep.dob)) : null,
      color: INSURED_COLORS[(i + 1) % INSURED_COLORS.length],
    })),
  ], [client.dependents, client.name, clientAge]);
  const insuredById = (id) => insuredList.find(p => p.id === id) || insuredList[0];
  // bars sit on the CLIENT's age axis: shift each insured person's ages by the age gap
  const offsetOf = (who) => (who.age != null && clientAge > 0 ? clientAge - who.age : 0);
  const kfmt = (v) => v >= 1000000 ? "$" + fmt(v / 1000000, 1) + "M" : v >= 1000 ? "$" + fmt(v / 1000, v % 1000 ? 1 : 0) + "k" : v > 0 ? "$" + fmt(v) : "";

  const items = useMemo(() => {
    if (mode === "current") {
      const plans = (client.existingPlans || []).map((p, i) => {
        const start = Math.max(0, Math.min(num(p.startAge ?? p.fromAge), TIMELINE_MAX_AGE));
        const rawEnd = num(p.endAge ?? p.toAge);
        const end = Math.max(Math.min(rawEnd > 0 ? rawEnd : TIMELINE_MAX_AGE, TIMELINE_MAX_AGE), start);
        const who = insuredById(p.insured || "self");
        const stepAge = num(p.stepDownAge), stepAmt = num(p.stepDownAmount);
        const hasStep = stepAge > start && stepAge < end && stepAmt > 0;
        const allocAmt = num(p.allocation ?? p.monthly);
        const premEnd = num(p.premiumEndsAge);
        return {
          id: p.id || "cur" + i,
          label: p.planName || p.planType || "Existing plan",
          category: p.category || "Others", start, end, insured: who, offset: offsetOf(who),
          covShort: kfmt(num(p.coverage)),
          stepAge: hasStep ? stepAge : null, stepAmt: hasStep ? stepAmt : null,
          premStart: premEnd > start ? start : null, premEnd: premEnd > start ? premEnd : null,
          details: [
            ["Insured", who.name + (who.age != null ? " (age " + who.age + ")" : "")],
            ["Plan type", p.planType], ["Policy number", p.policyNumber],
            ["Coverage", num(p.coverage) > 0 ? money(num(p.coverage)) : ""],
            ["Coverage ages", start + " – " + end + " (own age)"],
            ["Steps down", hasStep ? "to " + money(stepAmt) + " at age " + stepAge : ""],
            ["Allocation", allocAmt > 0 ? money(allocAmt, 2) + " / " + freqLabel(p.allocationFreq).toLowerCase() : ""],
            ["Premium ends", premEnd > 0 ? "age " + premEnd : ""],
            ["Notes", p.notes],
          ].filter(([, v]) => v),
        };
      });
      const invs = (client.existingInvestments || []).map((r, i) => {
        const start = Math.max(0, Math.min(num(r.startAge), TIMELINE_MAX_AGE));
        const monthlyEquiv = freqMonthlyEquiv(r.allocation, r.allocationFreq);
        // flatten rate groups → individual horizon points for the headline figure + details list
        const horizons = (r.returnRates || []).flatMap(g => (g.horizons || []).map(h => ({
          rate: num(g.rate), years: num(h.years),
          projected: num(h.projectedValueOverride) > 0 ? num(h.projectedValueOverride) : projectFV({ current: r.currentValue, contrib: monthlyEquiv, rate: g.rate, years: h.years }, 0),
        }))).filter(h => h.years > 0);
        const maxYears = horizons.reduce((m, h) => Math.max(m, h.years), 0);
        const headline = horizons.filter(h => h.years === maxYears).reduce((best, h) => (!best || h.projected > best.projected) ? h : best, null);
        const toAgeSet = num(r.toAge) > start;
        const end = toAgeSet ? Math.min(num(r.toAge), TIMELINE_MAX_AGE) : Math.min(start + (maxYears > 0 ? maxYears : TIMELINE_MAX_AGE - start), TIMELINE_MAX_AGE);
        const who = insuredById(r.insured || "self");
        const owner = insuredById(r.owner || "self");
        const payUntil = num(r.payUntilAge);
        return {
          id: r.id || "inv" + i,
          label: r.description || r.type || "Investment",
          category: r.category || "Investment Portfolio", start, end, insured: who, offset: offsetOf(who),
          covShort: kfmt(num(r.currentValue)) + (headline && headline.projected > num(r.currentValue) ? " → " + kfmt(headline.projected) : ""),
          stepAge: null, stepAmt: null,
          premStart: payUntil > start ? start : null, premEnd: payUntil > start ? payUntil : null,
          details: [
            ["Insured", who.name + (who.age != null ? " (age " + who.age + ")" : "")],
            ["Policy owner", owner.name], ["Type", r.type], ["Category", r.category],
            ["Coverage ages", start + " – " + end],
            ["Current value", num(r.currentValue) > 0 ? money(num(r.currentValue)) : ""],
            ["Allocation", num(r.allocation) > 0 ? money(num(r.allocation), 2) + " / " + freqLabel(r.allocationFreq).toLowerCase() : ""],
            ["Pay until", payUntil > 0 ? "age " + payUntil : ""],
            ...horizons.map(h => [h.rate + "% p.a. @ " + h.years + " yrs", money(h.projected)]),
            ["Notes", r.notes],
          ].filter(([, v]) => v),
        };
      });
      return [...plans, ...invs];
    }
    return (client.products || []).filter(p => p.include).map((p, i) => {
      const who = insuredById(p.insuredBy || "self");
      const baseAge = who.age != null ? who.age : clientAge;
      const start = Math.max(0, Math.min(p.startAge != null ? num(p.startAge) : baseAge, TIMELINE_MAX_AGE));
      let end = p.endAge != null ? num(p.endAge) : num(p.cciOption);
      if (!end) end = (RECO_END_AGE[p.key] || (() => TIMELINE_MAX_AGE))(start);
      end = Math.min(Math.max(end, start), TIMELINE_MAX_AGE);
      return {
        id: p.key + (p.cciOption || "") + i,
        label: p.label, category: p.category || "Others", start, end, insured: who, offset: offsetOf(who),
        covShort: (p.coverage || "").split("(")[0].trim(),
        stepAge: null, stepAmt: null, premStart: null, premEnd: null,
        details: [
          ["Insured", who.name + (who.age != null ? " (age " + who.age + ")" : "")],
          ["Tier", TIER_META[p.tier] ? TIER_META[p.tier].label : ""],
          ["Coverage", p.coverage], ["Coverage ages", start + " – " + end + " (own age)"],
          ["Premium", num(p.monthly) > 0 ? money(num(p.monthly), 2) + "/mo · " + money(num(p.annual), 2) + "/yr" : ""],
          ["Projected returns", p.returns],
        ].filter(([, v]) => v),
      };
    });
  }, [mode, client.existingPlans, client.existingInvestments, client.products, clientAge, insuredList]);

  // one section per insured person (client first), each with its own category rows;
  // the client's section also lists categories with no coverage yet as gaps
  const sections = useMemo(() => {
    // in current mode every dependent is shown (even with zero plans) so gaps are visible;
    // in recommended mode only dependents who actually have a recommended product appear
    const persons = insuredList.filter(pp => pp.id === "self" || mode === "current" || items.some(it => it.insured.id === pp.id));
    return persons.map(person => {
      const mine = items.filter(it => it.insured.id === person.id);
      let rows;
      if (mode === "current") {
        // client sees gaps across every insurance category; dependents only see the ones
        // that matter most for a child/spouse — critical illness, accident, hospitalisation
        // (and its death/disability sibling) — not retirement or "others"
        const gapCats = person.id === "self" ? EXISTING_PLAN_CATEGORIES : DEPENDENT_GAP_CATEGORIES;
        const covered = new Set(mine.map(it => it.category));
        const comboCovered = covered.has("Death, Disability & Critical Illness");
        rows = gapCats.filter(cat => {
          if (mine.some(it => it.category === cat)) return true;
          if (cat === "Others" || cat === "Child Savings") return false;              // no gap row for these
          if (cat === "Death, Disability & Critical Illness") return false;          // gap shown via the two singles
          if (comboCovered && (cat === "Death & Disability" || cat === "Critical Illness")) return false;
          return true;                                                                // uncovered → gap row
        }).map(cat => ({ category: cat, plans: mine.filter(it => it.category === cat) }));
        // categories outside the fixed gap list (e.g. "Investment Portfolio", "Retirement" for a dependent) still get their own row
        const extraCats = [...new Set(mine.map(it => it.category).filter(c => !gapCats.includes(c)))];
        rows = rows.concat(extraCats.map(cat => ({ category: cat, plans: mine.filter(it => it.category === cat) })));
      } else {
        const byCat = new Map();
        for (const it of mine) {
          if (!byCat.has(it.category)) byCat.set(it.category, []);
          byCat.get(it.category).push(it);
        }
        rows = [...byCat.entries()].map(([category, plans]) => ({ category, plans }));
      }
      return { person, rows };
    }).filter(s => s.rows.length > 0);
  }, [items, insuredList, mode]);

  const LABEL_W = 170, PLOT_W = 620, PAD_R = 10, AXIS_H = 34, BOT_H = 32, LANE_H = 16, LANE_GAP = 4, ROW_PAD = 7, EMPTY_H = 20, SEC_H = 22;
  const span = Math.max(win.a1 - win.a0, 1);
  const x = (age) => LABEL_W + ((age - win.a0) / span) * PLOT_W;
  const rowH = (r) => r.plans.length ? r.plans.length * LANE_H + (r.plans.length - 1) * LANE_GAP + ROW_PAD * 2 : EMPTY_H;
  const secH = (s) => SEC_H + s.rows.reduce((a, r) => a + rowH(r), 0);
  const plotH = Math.max(sections.reduce((a, s) => a + secH(s), 0), 40);
  const totalH = AXIS_H + plotH + BOT_H;
  const tickStep = span > 60 ? 10 : span > 25 ? 5 : span > 12 ? 2 : 1;
  const ticks = [];
  for (let t = Math.ceil(win.a0 / tickStep) * tickStep; t <= win.a1 + 0.001; t += tickStep) ticks.push(Math.round(t * 10) / 10);

  const zoomAt = (centerAge, factor) => {
    setSelected(null);
    setWin(v => {
      const oldSpan = v.a1 - v.a0;
      const s = Math.min(TIMELINE_MAX_AGE, Math.max(6, oldSpan * factor));
      let a0 = centerAge - (centerAge - v.a0) * (s / oldSpan);
      a0 = Math.max(0, Math.min(a0, TIMELINE_MAX_AGE - s));
      return { a0: Math.round(a0 * 10) / 10, a1: Math.round((a0 + s) * 10) / 10 };
    });
  };

  // wheel zoom needs a non-passive listener; React's synthetic onWheel can't preventDefault
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const v = winRef.current;
      const px = ((e.clientX - rect.left) / rect.width) * (LABEL_W + PLOT_W + PAD_R);
      const age = Math.max(0, Math.min(TIMELINE_MAX_AGE, v.a0 + ((px - LABEL_W) / PLOT_W) * (v.a1 - v.a0)));
      zoomAt(age, e.deltaY > 0 ? 1.25 : 0.8);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [items.length]);

  const showHover = (e, item) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ item, left: Math.min(e.clientX - r.left + 14, r.width - 240), top: e.clientY - r.top + 14 });
  };

  // clip an age range (already on the client axis) to the zoom window; null if outside
  const clipX = (a, b) => {
    if (b < win.a0 || a > win.a1) return null;
    const x0 = x(Math.max(a, win.a0)), x1 = x(Math.min(b, win.a1));
    return { x0, w: Math.max(x1 - x0, 2) };
  };

  const barLabel = (txt, g, y, bold) => g.w > 60 && (
    <text x={g.x0 + 5} y={y + LANE_H / 2 + 3} fontSize="8.5" fill="#fff" fontWeight={bold ? 700 : 400} pointerEvents="none">
      {txt.length > Math.floor(g.w / 5.3) ? txt.slice(0, Math.floor(g.w / 5.3) - 1) + "…" : txt}
    </text>
  );
  // premium/contribution commitment: a small two-ended black bracket sitting in a thin
  // strip along the top of the bar (not through its middle) so it never covers the label
  const premBracket = (p, y) => {
    if (p.premStart == null) return null;
    const g = clipX(p.premStart + p.offset, p.premEnd + p.offset);
    if (!g) return null;
    const topY = y + 1.5, capTop = y + 0.5, capBot = y + 4.5, x1 = g.x0, x2 = g.x0 + g.w;
    return (
      <g key="prem" pointerEvents="none">
        <line x1={x1} y1={topY} x2={x2} y2={topY} stroke="#0f172a" strokeWidth="1.25" />
        <line x1={x1} y1={capTop} x2={x1} y2={capBot} stroke="#0f172a" strokeWidth="1.25" />
        <line x1={x2} y1={capTop} x2={x2} y2={capBot} stroke="#0f172a" strokeWidth="1.25" />
      </g>
    );
  };

  const zoomed = win.a0 > 0 || win.a1 < TIMELINE_MAX_AGE;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="text-sm text-slate-500">Coverage span on the client's age axis{clientAge ? ` — client is ${clientAge} today` : ""}</div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
            <button onClick={() => zoomAt((win.a0 + win.a1) / 2, 0.7)} title="Zoom in" className="px-3 py-1.5 bg-white text-slate-600 hover:bg-slate-50 font-semibold">+</button>
            <button onClick={() => zoomAt((win.a0 + win.a1) / 2, 1.45)} title="Zoom out" className="px-3 py-1.5 bg-white text-slate-600 hover:bg-slate-50 font-semibold border-l border-slate-200">−</button>
            {zoomed && <button onClick={() => setWin({ a0: 0, a1: TIMELINE_MAX_AGE })} className="px-3 py-1.5 bg-white text-purple-800 hover:bg-purple-50 border-l border-slate-200">Reset ({Math.round(win.a0)}–{Math.round(win.a1)})</button>}
          </div>
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
            {[["current", "Current"], ["recommended", "Recommended"]].map(([k, label]) => (
              <button key={k} onClick={() => { setMode(k); setSelected(null); setHover(null); }} className={"px-4 py-1.5 font-medium transition-colors " + (mode === k ? "bg-purple-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      {items.length === 0 && mode === "recommended" ? (
        <div className="p-8 text-center text-slate-400 text-sm">No recommended plans selected yet — tick plans to include in the Recommended Plans step.</div>
      ) : sections.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">No existing plans added yet — add them in the Current Coverage step.</div>
      ) : (
        <>
        <svg ref={svgRef} viewBox={`0 0 ${LABEL_W + PLOT_W + PAD_R} ${totalH}`} className="w-full" role="img" aria-label={`${mode === "current" ? "Current" : "Recommended"} coverage timeline`}>
          <text x={LABEL_W} y={10} fontSize="9" fill="#64748b" fontWeight="600">CLIENT'S AGE</text>
          {ticks.map(t => (
            <g key={t}>
              <line x1={x(t)} y1={AXIS_H - 6} x2={x(t)} y2={AXIS_H + plotH} stroke="#e2e8f0" strokeWidth="1" />
              <text x={x(t)} y={AXIS_H - 10} textAnchor="middle" fontSize="9" fill="#94a3b8">{t}</text>
            </g>
          ))}
          {sections.map((sec, si) => {
            const secY = AXIS_H + sections.slice(0, si).reduce((a, s) => a + secH(s), 0);
            return (
              <g key={sec.person.id}>
                <rect x={0} y={secY} width={LABEL_W + PLOT_W + PAD_R} height={SEC_H - 4} fill="#f8fafc" />
                <circle cx={8} cy={secY + (SEC_H - 4) / 2} r="4" fill={sec.person.color} />
                <text x={18} y={secY + (SEC_H - 4) / 2 + 3.5} fontSize="10.5" fill={sec.person.color} fontWeight="700">
                  {sec.person.name}{sec.person.age != null ? " — age " + sec.person.age + " today" : ""}
                </text>
                {sec.rows.map((row, ri) => {
                  const y0 = secY + SEC_H + sec.rows.slice(0, ri).reduce((a, r) => a + rowH(r), 0);
                  if (!row.plans.length) {
                    const g = clipX(win.a0, win.a1);
                    return (
                      <g key={row.category}>
                        <text x={LABEL_W - 10} y={y0 + EMPTY_H / 2 + 3} textAnchor="end" fontSize="9.5" fill="#94a3b8" fontStyle="italic">{row.category}</text>
                        <rect x={g.x0} y={y0 + 3} width={g.w} height={EMPTY_H - 7} rx="4" fill="none" stroke="#cbd5e1" strokeDasharray="4 3" />
                        <text x={g.x0 + g.w / 2} y={y0 + EMPTY_H / 2 + 3} textAnchor="middle" fontSize="8.5" fill="#94a3b8" fontStyle="italic">not covered yet</text>
                      </g>
                    );
                  }
                  return (
                    <g key={row.category}>
                      <text x={LABEL_W - 10} y={y0 + rowH(row) / 2 + 3} textAnchor="end" fontSize="10" fill="#334155" fontWeight="600">{row.category}</text>
                      {row.plans.map((p, pi) => {
                        const y = y0 + ROW_PAD + pi * (LANE_H + LANE_GAP);
                        const cs = p.start + p.offset, ce = p.end + p.offset;
                        const active = hover?.item.id === p.id || selected?.id === p.id;
                        const common = {
                          style: { cursor: "pointer" },
                          onMouseMove: (e) => showHover(e, p),
                          onMouseLeave: () => setHover(null),
                          onClick: () => setSelected(s => s?.id === p.id ? null : p),
                        };
                        const opacity = active ? 1 : mode === "current" ? 0.65 : 0.85;
                        const stroke = selected?.id === p.id ? "#0f172a" : "none";
                        if (p.stepAge != null) {
                          const stepC = p.stepAge + p.offset;
                          const g1 = clipX(cs, stepC), g2 = clipX(stepC, ce);
                          return (
                            <g key={p.id}>
                              {g1 && <rect x={g1.x0} y={y} width={g1.w} height={LANE_H} rx="3" fill={p.insured.color} opacity={opacity} stroke={stroke} strokeWidth="1.5" {...common} />}
                              {g2 && <rect x={g2.x0} y={y + LANE_H * 0.25} width={g2.w} height={LANE_H * 0.55} rx="3" fill={p.insured.color} opacity={opacity * 0.65} stroke={stroke} strokeWidth="1.5" {...common} />}
                              {g1 && barLabel(p.label + (p.covShort ? " · " + p.covShort : ""), g1, y)}
                              {g2 && g2.w > 40 && <text x={g2.x0 + 5} y={y + LANE_H / 2 + 3} fontSize="8" fill="#fff" pointerEvents="none">{kfmt(p.stepAmt)} from {p.stepAge}</text>}
                              {premBracket(p, y)}
                            </g>
                          );
                        }
                        const g = clipX(cs, ce);
                        if (!g) return null;
                        return (
                          <g key={p.id}>
                            <rect x={g.x0} y={y} width={g.w} height={LANE_H} rx="4" fill={p.insured.color} opacity={opacity} stroke={stroke} strokeWidth="1.5" {...common} />
                            {barLabel(p.label + (p.covShort ? " · " + p.covShort : ""), g, y)}
                            {premBracket(p, y)}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                {/* coming-of-age milestones for this dependent — 18 always emphasised (only shown while still under 18), 21 shown while still under 21 */}
                {sec.person.id !== "self" && sec.person.age != null && clientAge > 0 && [18, 21].filter(m => sec.person.age < m).map(m => {
                  const mAge = clientAge + (m - sec.person.age);
                  if (mAge < win.a0 || mAge > win.a1) return null;
                  const secTop = secY + SEC_H, secBot = secY + secH(sec);
                  const under18 = m === 18;
                  return (
                    <g key={"m" + m}>
                      <line x1={x(mAge)} y1={secTop} x2={x(mAge)} y2={secBot} stroke="#059669" strokeWidth={under18 ? 2 : 1.25} strokeDasharray={under18 ? "none" : "3 2"} opacity={under18 ? 0.85 : 0.55} />
                      {under18 && <rect x={x(mAge) - 10} y={secTop - 1} width={20} height={11} rx="3" fill="#059669" />}
                      <text x={x(mAge)} y={secTop + 7} textAnchor="middle" fontSize="8" fill={under18 ? "#fff" : "#059669"} fontWeight="700">{m}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
          {clientAge > 0 && clientAge >= win.a0 && clientAge <= win.a1 && (
            <g>
              <line x1={x(clientAge)} y1={AXIS_H - 4} x2={x(clientAge)} y2={AXIS_H + plotH} stroke={BRAND.seal} strokeWidth="1.5" strokeDasharray="4 3" />
              <text x={x(clientAge)} y={AXIS_H + plotH + 12} textAnchor="middle" fontSize="9" fill={BRAND.seal} fontWeight="600">today</text>
            </g>
          )}
          {retireAge > 0 && retireAge >= win.a0 && retireAge <= win.a1 && (
            <g>
              <line x1={x(retireAge)} y1={AXIS_H - 4} x2={x(retireAge)} y2={AXIS_H + plotH} stroke="#d97706" strokeWidth="1.5" strokeDasharray="4 3" />
              <rect x={x(retireAge) - 4} y={AXIS_H - 8} width={8} height={8} transform={`rotate(45 ${x(retireAge)} ${AXIS_H - 4})`} fill="#d97706" />
              <text x={x(retireAge)} y={AXIS_H + plotH + 25} textAnchor="middle" fontSize="9" fill="#b45309" fontWeight="600">retirement ({retireAge})</text>
            </g>
          )}
        </svg>
        {/* legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-500">Insured:</span>
          {sections.map(s => (
            <span key={s.person.id} className="inline-flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.person.color, display: "inline-block" }} />
              {s.person.name}{s.person.age != null ? ` (${s.person.age})` : ""}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <svg width="20" height="10"><line x1="10" y1="0" x2="10" y2="10" stroke={BRAND.seal} strokeWidth="1.5" strokeDasharray="3 2" /></svg>
            today
          </span>
          {retireAge > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="10"><line x1="10" y1="0" x2="10" y2="10" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
              retirement ({retireAge})
            </span>
          )}
          {sections.some(s => s.person.id !== "self") && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="10"><rect x="6" y="0" width="8" height="9" rx="2" fill="#059669" /></svg>
              turns 18 (still under 18) · <svg width="14" height="10"><line x1="7" y1="0" x2="7" y2="10" stroke="#059669" strokeWidth="1.25" strokeDasharray="3 2" /></svg> turns 21
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <svg width="26" height="12"><rect x="0" y="1" width="13" height="10" rx="2" fill="#94a3b8" /><rect x="13" y="3.5" width="13" height="5" rx="2" fill="#94a3b8" opacity="0.6" /></svg>
            coverage steps down
          </span>
          {items.some(it => it.premStart != null) && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="24" height="10"><line x1="2" y1="5" x2="22" y2="5" stroke="#0f172a" strokeWidth="2" /><line x1="2" y1="1" x2="2" y2="9" stroke="#0f172a" strokeWidth="2" /><line x1="22" y1="1" x2="22" y2="9" stroke="#0f172a" strokeWidth="2" /></svg>
              premium / contribution period
            </span>
          )}
          {mode === "current" && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="12"><rect x="1" y="1.5" width="18" height="9" rx="3" fill="none" stroke="#cbd5e1" strokeDasharray="4 3" /></svg>
              not covered yet
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">All rows share the client's age axis — dependents' bars are shifted so everyone lines up in calendar time (their own ages are in the details). Hover a bar for details · click to pin the full breakdown · scroll on the chart or use − / + to zoom.</p>
        {/* pinned detail card */}
        {selected && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="font-semibold text-slate-800">
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: selected.insured.color, marginRight: 8 }} />
                {selected.label}
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 mt-2">
              {selected.details.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1">
                  <span className="text-slate-500 text-xs uppercase tracking-wide pt-0.5">{k}</span>
                  <span className="text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      )}
      {/* hover tooltip */}
      {hover && (
        <div className="absolute z-10 pointer-events-none rounded-lg bg-slate-900 text-white text-xs px-3 py-2 shadow-lg" style={{ left: hover.left, top: hover.top, maxWidth: 240 }}>
          <div className="font-semibold mb-1">{hover.item.label}</div>
          {hover.item.details.slice(0, 5).map(([k, v]) => <div key={k}><span className="text-slate-400">{k}: </span>{v}</div>)}
          <div className="text-slate-400 mt-1 italic">click to pin details</div>
        </div>
      )}
      {mode === "recommended" && items.length > 0 && (
        <p className="text-xs text-slate-400 mt-2">Bars use each plan's own start/end ages where set; otherwise they run from the insured person's current age to the plan's coverage end (e.g. whole life to 100, term options to their stated age).</p>
      )}
    </div>
  );
}


// ---------- main app ----------
const STEPS = [
  { label: "Profile", icon: User },
  { label: "Income Allocation", icon: Wallet },
  { label: "Assets & Liabilities", icon: Scale },
  { label: "Objectives", icon: Target },
  { label: "Current Coverage", icon: Shield },
  { label: "Recommended Plans", icon: ClipboardList },
  { label: "Overview", icon: LayoutDashboard },
  { label: "Narrative", icon: FileText },
];

export default function App() {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("list"); // list | edit | report
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState("");
  const [privacy, setPrivacy] = useState(true);
  const [clientQuery, setClientQuery] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.innerWidth < 1024) return false;
    return window.localStorage.getItem("gl-sidebar-expanded") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("gl-sidebar-expanded", sidebarExpanded ? "1" : "0");
  }, [sidebarExpanded]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadClients();
        if (!cancelled) setClients(list);
      } catch (e) {
        if (!cancelled) toast.error("Could not load clients: " + (e?.message || e));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    try { const r = localStorage.getItem(PRIV_KEY); if (r !== null) setPrivacy(r !== "0"); } catch(_) {}
    return () => { cancelled = true; };
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
      const updated = next.find(c => c.id === activeId);
      if (updated) saveClient(updated).catch(e => toast.error("Save failed: " + (e?.message || e)));
      return next;
    });
  };
  const updateDeep = (key, patch) => update({ [key]: { ...client[key], ...patch } });

  const persist = async () => {
    if (!client) return;
    setSaveState("saving");
    const ok = await saveClient(client);
    setSaveState(ok ? "saved" : "error");
    setTimeout(() => setSaveState(""), 2000);
  };

  const newClient = async () => {
    const c = blankClient();
    setClients(prev => [c, ...prev]);
    setActiveId(c.id); setView("edit"); setStep(0);
    const ok = await saveClient(c);
    if (!ok) toast.error("Could not create client in the cloud.");
  };
  const removeClient = async (id) => {
    try {
      await deleteClientRow(id);
    } catch (e) {
      toast.error("Delete failed: " + (e?.message || e));
      return;
    }
    setClients(prev => prev.filter(c => c.id !== id));
    if (activeId === id) { setActiveId(null); setView("list"); }
  };

  const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const safeFilenamePart = (s) => (s || "unnamed").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "unnamed";
  const exportAll = () => {
    if (!clients.length) { toast.error("No clients to export."); return; }
    downloadJSON(clients, "goodlife-clients-backup.json");
  };
  const exportOne = (c) => {
    downloadJSON(c, `goodlife-client-${safeFilenamePart(c.name)}.json`);
  };
  const fileInputRef = useRef(null);
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const imported = [];
      for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const c = migrate({ ...raw, id: uid(), updated: Date.now() });
        const ok = await saveClient(c);
        if (ok) imported.push(c);
      }
      const fresh = await loadClients();
      setClients(fresh);
      toast.success(`${imported.length} client(s) imported successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Import failed: " + (err?.message || err));
    }
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

  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");

  const draftWithAI = async () => {
    if (!client || !d) return;
    setDrafting(true);
    setDraftError("");
    try {
      const promptText = buildClaudePrompt(client, d);
      const { data, error } = await supabase.functions.invoke('draft-narrative', {
        body: { prompt: promptText }
      });

      if (error) {
        console.error('Edge function error:', error);
        let message = error.message;
        try {
          const details = await error.context?.json?.();
          if (details?.details) message = `${message}: ${details.details}`;
          else if (details?.error) message = `${message}: ${details.error}`;
        } catch (_detailsError) {
          // Keep the original SDK error message if the response body cannot be read.
        }
        throw new Error(message);
      }
      if (!data || (data.error && !data.exec && !data.recoIntro && !data.actionPlan)) {
        throw new Error(data?.error || "No content returned");
      }
      updateDeep("narrative", {
        exec: data.exec || "",
        recoIntro: data.recoIntro || "",
        actionPlan: data.actionPlan || "",
      });
      toast.success("Draft generated");
    } catch (e) {
      console.error(e);
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDrafting(false);
    }
  };

  const doDownloadDocx = async () => {
    setDownloadingDocx(true);
    const prevView = view;
    try {
      // the capture nodes only exist in the report view — switch there briefly if needed
      if (prevView !== "report") {
        setView("report");
        await new Promise(r => setTimeout(r, 400));
      }
      const captures = await captureChartsForDocx();
      await generateDocx({ client, d, planLibrary: PLAN_LIBRARY, tierMeta: TIER_META, logoUrl: LOGO, captures });
    } catch (e) {
      console.error(e);
      alert("Could not generate the Word document.\n\n" + (e?.message || e));
    } finally {
      if (prevView !== "report") setView(prevView);
      setDownloadingDocx(false);
    }
  };

  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // Rasterize the chart SVGs directly — html2canvas cannot parse the lab()/oklch()
  // colors Tailwind v4 emits, so every capture through it fails silently.
  const captureChartsForDocx = async () => {
    const root = document.getElementById("report-content");
    if (!root) return {};
    const nodes = root.querySelectorAll("[data-docx-capture]");
    const map = {};
    for (const el of nodes) {
      const key = el.getAttribute("data-docx-capture");
      const svg = el.querySelector("svg");
      if (!svg) continue;
      try {
        const vb = svg.viewBox && svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        const w = Math.round((vb && vb.width) || rect.width || 600);
        const h = Math.round((vb && vb.height) || rect.height || 300);
        const clone = svg.cloneNode(true);
        clone.setAttribute("width", w);
        clone.setAttribute("height", h);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.style.fontFamily = "'Source Sans 3', Helvetica, Arial, sans-serif";
        const xml = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res; img.onerror = rej;
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
        });
        const scale = 2;
        const canvas = document.createElement("canvas");
        canvas.width = w * scale; canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        map[key] = { base64: canvas.toDataURL("image/png").split(",")[1], w: canvas.width, h: canvas.height };
      } catch (err) {
        console.warn("chart capture failed for", key, err);
      }
    }
    return map;
  };

  if (!loaded) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-100 text-slate-500">
      <div className="h-10 w-10 rounded-full border-4 border-purple-200 border-t-purple-700 animate-spin" />
      <div className="text-sm">Loading clients…</div>
    </div>
  );

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
            <button onClick={exportAll} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 bg-white">⬇ Export all</button>
            <button onClick={() => fileInputRef.current?.click()} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 bg-white">⬆ Import clients</button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
            <button onClick={newClient} className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ New client</button>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 bg-white">Sign out</button>
          </div>
        </div>
        {clients.length > 0 && (
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              value={clientQuery}
              onChange={e => setClientQuery(e.target.value)}
              placeholder="Search clients by name or occupation…"
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600"
            />
            {clientQuery && (
              <button onClick={() => setClientQuery("")} title="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm">✕</button>
            )}
          </div>
        )}
        {clients.length === 0 && (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500">
            No clients yet. Start a new client to begin the fact-find.
          </div>
        )}
        {/* Match against the real name/occupation even while privacy mode shows only initials */}
        {(() => {
          const q = clientQuery.trim().toLowerCase();
          const visible = q
            ? clients.filter(c => (c.name || "").toLowerCase().includes(q) || (c.occupation || "").toLowerCase().includes(q))
            : clients;
          if (clients.length > 0 && visible.length === 0) return (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 text-sm">
              No clients match “{clientQuery.trim()}”.
            </div>
          );
          return (
        <div className="space-y-3">
          {visible.map(c => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">{displayName(c.name, "Unnamed client")}</div>
                <div className="text-xs text-slate-400">Updated {new Date(c.updated).toLocaleDateString("en-GB")} · {c.occupation || "—"}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setActiveId(c.id); setView("edit"); setStep(0); }} className="text-sm px-3 py-1.5 rounded-lg border border-purple-700 text-purple-800 hover:bg-purple-50">Open</button>
                <button onClick={() => { setActiveId(c.id); setView("report"); }} className="text-sm px-3 py-1.5 rounded-lg bg-purple-700 text-white hover:bg-purple-800">Report</button>
                <button onClick={() => exportOne(c)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Export</button>
                <button onClick={() => { if (confirm("Delete " + displayName(c.name, "this client") + "?")) removeClient(c.id); }} className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
          );
        })()}
        <p className="text-xs text-slate-400 mt-8">Client data is saved privately to your account in this app. Remember your confidentiality obligations when handling client information.</p>
      </main>
    </div>
  );

  // ----- report view -----
  if (view === "report") {
    const n = client.narrative;
    const para = (t) => (t || "").split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i} style={{textAlign:"justify",lineHeight:1.65,marginBottom:12,whiteSpace:"pre-line"}}>{p}</p>);
    // action plan: bold the numbered heading before the colon ("1. Title: details…")
    const paraAction = (t) => (t || "").split(/\n+/).filter(s => s.trim()).map((p, i) => {
      const m = p.match(/^(\d+[.)]\s*)([^:\n]{2,90}):\s*([\s\S]*)$/);
      if (m) return (
        <p key={i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, whiteSpace: "pre-line" }}>
          <b style={{ color: "#3a1955" }}>{m[1]}{m[2]}:</b> {m[3]}
        </p>
      );
      return <p key={i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, whiteSpace: "pre-line" }}>{p}</p>;
    });
    const doPrintPdf = () => {
      const prev = document.title;
      document.title = "GoodLife-Report-" + (client.name || "Client").trim().replace(/\s+/g, "-");
      window.print();
      setTimeout(() => { document.title = prev; }, 1000);
    };

  // Smart plan body renderer — returns { main, limitations } so callers can
  // interleave images between the main content and the limitations block.
  const renderPlanBody = (body) => {
    if (!body) return { main: null, limitations: null };
    const lines = body.split("\n").filter(l => l.trim());
    const mainEls = [];
    let limitationsEl = null;
    let bulletGroup = [], limitGroup = [];
    const flushBullets = () => {
      if (!bulletGroup.length) return;
      mainEls.push(
        <ul key={"ul" + mainEls.length} className="mb-4 space-y-2">
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
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("∴")) {
        flushBullets();
        if (trimmed === "Plan Limitations:" || trimmed === "Plan Limitation:") return; // header row, skip
        limitGroup.push(trimmed);
      } else if (trimmed.startsWith("•")) {
        bulletGroup.push(trimmed);
      } else if (trimmed === "Plan Limitations:" || trimmed === "Plan Limitation:") {
        flushBullets();
        // skip header, next lines will be ∴
      } else {
        flushBullets();
        mainEls.push(
          <p key={"p" + i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, fontSize: 13.5, color: "#1f2937" }}>{trimmed}</p>
        );
      }
    });
    flushBullets();
    if (limitGroup.length) {
      limitationsEl = (
        <div className="mt-3 mb-3 rounded-lg border border-red-100 bg-red-50 p-3">
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
    }
    return { main: <div>{mainEls}</div>, limitations: limitationsEl };
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
            /* Lovable injects an "Edit with Lovable" badge on hosted previews — keep it out of the PDF */
            #lovable-badge,a[href*="lovable.dev"],a[href*="lovable.app"],[id*="lovable" i],div[class*="lovable" i]{display:none!important}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
            .sheet{box-shadow:none!important;margin:0!important;width:100%!important;padding:14mm 16mm!important}
            @page{size:A4;margin:0}
          }
        `}</style>
        <div className="no-print sticky top-0 z-10 text-white px-6 py-3 flex items-center justify-between" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 100%)" }}>
          <div className="text-sm"><span className="font-semibold">{displayName(client.name, "Unnamed")}</span> — report preview</div>
          <div className="flex gap-2">
            <button onClick={() => setView("edit")} className="text-sm px-3 py-1.5 rounded-lg border border-purple-400 hover:bg-purple-900">← Back to editing</button>
            <button onClick={doPrintPdf} className="text-sm px-3 py-1.5 rounded-lg bg-white text-purple-900 font-semibold hover:bg-purple-100">⬇ Save as PDF</button>
            <button onClick={doDownloadDocx} disabled={downloadingDocx} className="text-sm px-3 py-1.5 rounded-lg bg-white text-purple-900 font-semibold hover:bg-purple-100 disabled:opacity-60 disabled:cursor-wait">{downloadingDocx ? "Capturing charts…" : "⬇ Download as Word (.docx)"}</button>
          </div>
        </div>
        <div id="report-content" className="rpt sheet bg-white max-w-[210mm] mx-auto my-6 shadow-xl" style={{ padding: "18mm 18mm" }}>
          {/* cover — mirrors the Canva master template */}
          <div style={{ minHeight: "252mm", display: "flex", flexDirection: "column" }}>
            <div className="text-center" style={{ paddingTop: 56 }}>
              <div style={{ display: "inline-block", border: "2.5px solid #475569", padding: "8px 32px", background: "#fff" }}>
                <span style={{ color: "#dc2626", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", fontFamily: "Arial, Helvetica, sans-serif" }}>CONFIDENTIAL</span>
              </div>
            </div>
            <div className="text-center" style={{ marginTop: 90 }}>
              <div className="serif text-2xl italic text-slate-600">Recommendation Report</div>
              <div className="serif text-xl italic text-slate-600 mb-4">specially prepared for</div>
              <h1 className="serif text-4xl font-bold text-purple-900 uppercase tracking-wide">{client.name || "—"}</h1>
            </div>
            <div style={{ flex: 1 }} />
            <div className="text-left text-sm">
              <div className="font-bold">Prepared by:</div>
              <div className="font-bold">Abdul Azim Saifuddin</div>
              <div>BSc, CFP — Financial Planning Service Provider</div>
              <div>AIA Senior Life Advisor</div>
              <div className="italic text-slate-600 mt-4">Date Presented: {client.meetingDate || todayLong()}</div>
            </div>
            <div className="flex items-end justify-between mt-10">
              <div className="text-left text-xs italic text-slate-600" style={{ maxWidth: "55%" }}>
                <div>Authorised representative of AIA Singapore</div>
                <div>(Ref No. RFC20004468)</div>
                <div>BDCB License No: 129/AIA &amp; 288/AIA</div>
              </div>
              <div className="text-center">
                <img src={LOGO} alt="GoodLife Financial Planning" style={{ maxWidth: 240, width: "100%" }} />
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">A Subsidiary of Nancy Group</div>
              </div>
            </div>
            <div className="text-center text-sm mt-8">The information collected and maintained in this document will be held in the <b>strictest confidence</b>.</div>
          </div>

          <div className="pagebreak" />
          <h2>Table of Contents</h2>
          {(() => {
            const hasOther = (client.otherObjectives || []).filter(o => o.name || num(o.target) > 0).length > 0;
            const entries = [
              { num: "1.", title: "Executive Summary", sub: [
                ...(client.sections.hierarchy ? ["The Hierarchy of Needs in Financial Planning"] : []),
                ...(client.sections.education ? EDU_SECTIONS.slice(1).map(s => s.title) : []),
              ] },
              { num: "2.", title: "Your Finances", sub: [
                "Net Worth", "2.1 Cash Flow Summary",
                ...(client.sections.allocation ? ["4-3-2-1 Allocation"] : []),
                ...(client.sections.ratios ? ["2.2 Financial Ratio Analysis"] : []),
              ] },
              { num: "3.", title: "Your Concerns & Objectives", sub: [
                "3.1 Income Replacement", "3.2 Retirement Planning",
                ...(hasOther ? ["3.3 Other Objectives"] : []),
              ] },
              { num: "4.", title: "Recommendation", sub: [
                ...(n.actionPlan ? ["Action Plan"] : []),
                "4.1 Recommended Plans",
              ] },
              ...(d.selected.length ? [{ num: "5.", title: "Explanation of Plan Options", sub: d.selected.map((p, i) => (i + 1) + ". " + (PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label)) }] : []),
              { num: d.selected.length ? "6." : "5.", title: "Conclusion", sub: ["Client Acknowledgement"] },
            ];
            return (
              <div style={{ fontSize: 13, marginTop: 18 }}>
                {entries.map((e, i) => (
                  <div key={i} style={{ marginBottom: 12, breakInside: "avoid" }}>
                    <div style={{ display: "flex", alignItems: "baseline", fontWeight: 700, color: "#3a1955" }}>
                      <span style={{ width: 26, flexShrink: 0 }}>{e.num}</span>
                      <span style={{ textTransform: "uppercase", letterSpacing: "0.03em" }}>{e.title}</span>
                      <span style={{ flex: 1, borderBottom: "2px dotted #cbd5e1", margin: "0 0 3px 8px" }} />
                    </div>
                    {e.sub.map((s, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "baseline", color: "#475569", marginLeft: 26, fontStyle: "italic", lineHeight: 1.8 }}>
                        <span>{s}</span>
                        <span style={{ flex: 1, borderBottom: "1px dotted #e2e8f0", margin: "0 0 4px 8px" }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}

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
          {d.assetPie.length > 0 && (<div className="my-3" data-docx-capture="assetPie"><StaticDonut data={d.assetPie} colorMap={ASSET_COLORS} /></div>)}
          <p className="text-xs text-slate-500 mb-4">Personal-use assets (houses, vehicles) form part of your standard of living and are normally not drawn upon at death or retirement. Invested assets are held to produce income or capital growth and are available to you or your dependants. Cash and equivalents can normally be liquidated within a week or two and form part of your Emergency Fund.</p>
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
            {d.pie.length > 0 && (<div className="my-3" data-docx-capture="allocationPie"><StaticDonut data={d.pie} colorMap={PIE_COLORS} /></div>)}
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
                <div className="my-4 border border-slate-200 rounded-xl p-4" data-docx-capture="emergencyFund">
                  <StaticEmergencyFund months={months} cash={d.cash} ef3={d.ef3} ef6={d.ef6} pct3={pct3} pct6={pct6} pass3={pass3} pass6={pass6} />
                </div>
              );
            })()}
            {d.ratioBars.length > 0 && (<div className="my-3" data-docx-capture="ratioBars"><div className="text-xs text-slate-500 mb-1 text-center">Financial ratios vs. benchmark — capped at 100% (green = healthy, red = needs attention).</div><StaticRatioBars data={d.ratioBars} /></div>)}
          </>)}

          <div className="pagebreak" />
          <h2>3. Your Concerns &amp; Objectives</h2>
          {calcAge(client.dob) !== "" && (
            <div className="my-4" style={{ breakInside: "avoid" }}>
              <LifeTimeline client={client} />
              <p className="text-xs text-slate-500 mt-1" style={{ textAlign: "center" }}>Your planning horizon at a glance — where you are today, your target retirement age, your dependents, and the years beyond. Green marks show when each child reaches 18 and 21.</p>
            </div>
          )}
          <h3>3.1 Income Replacement</h3>
          <p className="mb-2">To provide an income of {money(d.irMonthly)} per month in the event of premature death or total permanent disability, for {d.irYears} years from today (potential income of {money(d.potentialIncome)}).</p>
          <table>
            <thead><tr><th>Need</th><th>Guideline</th><th className="tnum">Benchmark</th><th className="tnum">Current</th><th className="tnum">Shortfall</th></tr></thead>
            <tbody>{d.irRows.map(r => (
              <tr key={r.name}><td>{r.name}</td><td>{r.guideline}</td><td className="tnum">{money(r.bench)}</td><td className="tnum">{money(r.current)}</td><td className={"tnum " + (r.shortfall > 0 ? "text-red-700 font-semibold" : "text-purple-800")}>{money(r.shortfall)}</td></tr>
            ))}</tbody>
          </table>
          <p className="text-xs text-slate-500 mb-4">Without adequate coverage for death, disability and sickness: (i) your SPK and other income might not be sufficient to support family expenses; (ii) you might have to downgrade to a less desired lifestyle.</p>
          <h3>3.2 Retirement Planning</h3>
          <p className="mb-2">To provide a minimum of {money(num(client.retirement.monthly))} per month for {client.retirement.years} years after retirement (assuming post-retirement savings follow the rate of inflation).</p>
          <table>
            <thead>
              <tr style={{ background: "#51037c", color: "#fff" }}>
                <th style={{ color: "#fff" }}>Item</th>
                <th className="tnum" style={{ color: "#fff" }}>Amount Required</th>
                <th className="tnum" style={{ color: "#fff" }}>Current Projected Arrangement</th>
                <th className="tnum" style={{ color: "#fff" }}>Projected Shortfall</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Amount required for {client.retirement.years} years</td>
                <td className="tnum">{money(d.rtRequired)}</td>
                <td className="tnum">—</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>Inflation-adjusted ({client.retirement.inflation}% over {d.yearsToRet} years)</td>
                <td className="tnum">{money(d.rtAdjusted)}</td>
                <td className="tnum">—</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>SPK — Member Account (projected)</td>
                <td className="tnum">—</td>
                <td className="tnum">{money(num(client.retirement.spkProj))}</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>SPK Annuity — Employer{num(client.retirement.spkAnnuityMonthly) > 0 ? " (" + money(num(client.retirement.spkAnnuityMonthly)) + "/mo × " + client.retirement.spkAnnuityYears + " yrs)" : ""}</td>
                <td className="tnum">—</td>
                <td className="tnum">{money(d.spkAnnuityTotal)}</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>Old Age Pension</td>
                <td className="tnum">—</td>
                <td className="tnum">{money(num(client.retirement.pension))}</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>Other Annuities (projected)</td>
                <td className="tnum">—</td>
                <td className="tnum">{money(d.annTotal)}</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>Other Investments (projected)</td>
                <td className="tnum">—</td>
                <td className="tnum">{money(d.invTotal)}</td>
                <td className="tnum">—</td>
              </tr>
              <tr style={{ background: "#f5f0fa" }}>
                <td className="font-bold">Total</td>
                <td className="tnum font-bold">{money(d.rtAdjusted)}</td>
                <td className="tnum font-bold">{money(d.rtProjected)}</td>
                <td className={"tnum font-bold " + (d.rtShortfall > 0 ? "text-red-700" : "text-purple-900")}>{d.rtShortfall > 0 ? "-" + money(d.rtShortfall) : money(0)}</td>
              </tr>
            </tbody>
          </table>
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
          {n.actionPlan && (<><h3>Action Plan</h3>{paraAction(n.actionPlan)}</>)}

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
                    <td>{p.coverage}</td><td className="tnum">{money(num(p.monthly), 2)}</td><td className="tnum">{money(num(p.annual), 2)}</td><td className="text-xs">{(p.returns || "").split(/\s*·\s*/).filter(Boolean).map((seg, si) => <div key={si}>{seg}</div>)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
          {d.selected.length > 0 && (
            <table><tbody><tr><td className="font-bold">Total of plans shown</td><td className="tnum font-bold">{money(d.premMonthly, 2)} / month · {money(d.premAnnual, 2)} / year</td></tr></tbody></table>
          )}
          {d.net > 0 && (() => {
            const protGuide = d.net * 0.1, savGuide = d.net * 0.2;
            const protSel = d.selected.filter(p => p.category === "Risk Management").reduce((s, p) => s + num(p.monthly), 0);
            const savSel = d.selected.filter(p => p.category !== "Risk Management").reduce((s, p) => s + num(p.monthly), 0);
            const row = (ok) => ok ? "text-purple-900" : "text-red-700";
            return (
              <div className="my-4" style={{ breakInside: "avoid" }}>
                <h3>Budget guideline — the 4-3-2-1 rule</h3>
                <p className="text-xs text-slate-500 mb-1">As a guideline, set aside about <b>10%</b> of take-home income for protection (insurance) and <b>20%</b> for savings &amp; investments — around 30% combined working toward your future.</p>
                <table>
                  <thead><tr><th>Allocation</th><th className="tnum">Guideline /mo</th><th className="tnum">Selected plans /mo</th><th>Position</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>Protection plans (10% of net income)</td>
                      <td className="tnum">{money(protGuide)}</td>
                      <td className="tnum">{money(protSel, 2)}</td>
                      <td className={"font-semibold " + row(protSel <= protGuide)}>{protSel <= protGuide ? "Within guideline" : "Above guideline by " + money(protSel - protGuide, 2)}</td>
                    </tr>
                    <tr>
                      <td>Savings &amp; investment plans (20% of net income)</td>
                      <td className="tnum">{money(savGuide)}</td>
                      <td className="tnum">{money(savSel, 2)}</td>
                      <td className={"font-semibold " + row(savSel <= savGuide)}>{savSel <= savGuide ? "Room of " + money(savGuide - savSel, 2) : "Above guideline by " + money(savSel - savGuide, 2)}</td>
                    </tr>
                    <tr style={{ background: "#f5f0fa" }}>
                      <td className="font-bold">Combined (30% of net income)</td>
                      <td className="tnum font-bold">{money(protGuide + savGuide)}</td>
                      <td className="tnum font-bold">{money(d.premMonthly, 2)}</td>
                      <td className={"font-bold " + row(d.premMonthly <= protGuide + savGuide)}>{d.premMonthly <= protGuide + savGuide ? "Within guideline" : "Above guideline"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}
          <p className="text-xs text-slate-500 mt-2"><b>Recommended</b> plans fit within the indicated budget of {client.budgetNote}. <b>Worth considering</b> are additional options currently outside that budget. <b>Future options</b> are plans to explore as your finances allow or as priorities evolve. Returns are based on the Projected Investment Rate of Return on AIA's Participating Fund at 4.25% p.a. unless stated otherwise.</p>

          {d.selected.length > 0 && (<><div className="pagebreak" /><h2>5. Explanation of Plan Options</h2>
            {d.selected.map((p, i) => {
              const parts = PLAN_LIBRARY[p.key] ? renderPlanBody(PLAN_LIBRARY[p.key].body) : { main: null, limitations: null };
              return (
                <div key={p.key + i} style={{ breakBefore: i > 0 ? "page" : "auto" }}>
                  <h3>{i + 1}. {PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label}</h3>
                  {parts.main}
                  {(p.planImages||[]).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {p.planImages.map(img => (
                        <div key={img.id} style={{ breakInside: "avoid", marginBottom: 16, textAlign: "center" }}>
                          <img src={img.dataUrl} alt={img.caption||img.name} style={{ maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 6, display: "inline-block" }} />
                          {img.caption && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, textAlign: "center", fontStyle: "italic" }}>{img.caption}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {parts.limitations}
                </div>
              );
            })}</>)}

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
  const sidebarWidth = sidebarExpanded ? 220 : 64;
  const navRow = (Icon, label, active, onClick, extra = {}) => (
    <button
      onClick={onClick}
      title={sidebarExpanded ? "" : label}
      className={"w-full flex items-center transition-colors rounded-md " + (active ? "bg-white text-[#3a1955]" : "text-white hover:bg-white/10")}
      style={{ padding: "10px 12px", opacity: active ? 1 : 0.85, ...extra.style }}
    >
      <Icon size={extra.iconSize || 18} style={{ opacity: active ? 1 : 0.9, flexShrink: 0 }} />
      {sidebarExpanded && <span className="ml-3 truncate" style={{ fontSize: extra.fontSize || 13, fontWeight: 500 }}>{label}</span>}
    </button>
  );
  return (
    <div className="min-h-screen bg-slate-100 flex">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap'); .font-serif{font-family:'Cormorant Garamond',Georgia,serif} body{font-family:'Source Sans 3',system-ui,sans-serif}`}</style>
      <aside
        className="sticky top-0 h-screen flex flex-col shrink-0 transition-all duration-200"
        style={{ width: sidebarWidth, background: "#3a1955", borderRight: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {STEPS.map((s, i) => navRow(s.icon, `${i + 1}. ${s.label}`, step === i, () => setStep(i)))}
        </div>
        <div className="p-2 border-t border-white/10 space-y-1">
          <button
            onClick={() => setSidebarExpanded(v => !v)}
            title={sidebarExpanded ? "Collapse" : "Expand"}
            className="w-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-md"
            style={{ padding: "8px" }}
          >
            {sidebarExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          {navRow(Save, "Save", false, persist, { iconSize: 16, fontSize: 12, style: { opacity: 0.75 } })}
          {navRow(Eye, "Preview Report", false, () => { persist(); setView("report"); }, { iconSize: 16, fontSize: 12, style: { opacity: 0.75 } })}
          {navRow(Download, downloadingDocx ? "Capturing…" : "Download DOCX", false, doDownloadDocx, { iconSize: 16, fontSize: 12, style: { opacity: 0.75 } })}
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="text-white flex items-center justify-between px-6 shrink-0" style={{ height: 48, background: "linear-gradient(120deg, #3a1955 0%, #51037c 100%)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => { persist(); setView("list"); }} className="text-xs text-purple-200 hover:text-white">← Clients</button>
            <span className="font-serif text-lg">GoodLife</span>
          </div>
          <div className="flex items-center gap-3">
            {saveState && <span className="text-xs text-purple-200">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save failed"}</span>}
            <button
              onClick={async () => {
                const email = String(client.email || "").trim();
                if (!email) { toast.error("Please add the client's email address to their profile before sharing the portal link."); return; }
                const url = `${window.location.origin}/portal/${client.id}`;
                try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked */ }
                toast.success(`Link copied — send this to ${displayName(client.name, "the client")} at ${email}`);
              }}
              title="Copy portal link"
              className="flex items-center gap-1 text-xs text-purple-100 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2 py-1"
            >
              <Share2 size={14} /> Share portal link
            </button>
            <span className="font-serif text-base">{displayName(client.name, "New client")}</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto" style={{ padding: 24, background: "#f8fafc" }}>
          <h2 className="text-xl font-serif text-[#3a1955] mb-4">{step + 1}. {STEPS[step].label}</h2>
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
              <Field label="Target retirement age" hint="drives the default planning horizons in the Objectives step"><NumInput value={client.retirementAge} onChange={e => update({ retirementAge: e.target.value })} /></Field>
              <Field label="Occupation"><Input value={client.occupation} onChange={e => update({ occupation: e.target.value })} /></Field>
              <Field label="Occupation details"><Input value={client.occDetails} onChange={e => update({ occDetails: e.target.value })} /></Field>
              <Field label="Client email (for portal login)"><Input type="email" value={client.email || ""} onChange={e => update({ email: e.target.value })} placeholder="client@example.com" /></Field>
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
              {d.ratios.filter(r => r.id !== "liquidity").map(r => {
                const isNegNW = r.negNW && r.value == null;
                const tone = isNegNW
                  ? "border-slate-200 bg-slate-50"
                  : (r.pass == null ? "border-slate-200 bg-slate-50" : r.pass ? "border-purple-300 bg-purple-50" : "border-red-300 bg-red-50");
                return (
                  <div key={r.id} className={"rounded-lg border px-3 py-2 text-sm " + tone}>
                    <div className="flex justify-between"><b>{r.name}</b><span className="tabular-nums">{r.value == null ? "—" : r.fmtV(r.value)}</span></div>
                    <div className="text-xs text-slate-500">Benchmark {r.dir === ">=" ? "≥" : "≤"} {fmt(r.target * 100, 0) + "%"} · {isNegNW ? "n/a" : (r.pass == null ? "n/a" : r.pass ? "Healthy" : "Needs attention")}</div>
                    {isNegNW && <div className="text-xs text-slate-500 italic mt-0.5">Net worth is negative — ratio not applicable.</div>}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </>)}

        {step === 3 && (<>
          <SectionCard title="3.1 Income replacement objective">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <Field label="Income to replace ($/month)" hint={num(client.incomeReplacement.monthly) > 0 ? "" : "using net income: " + money(d.net)}><NumInput value={client.incomeReplacement.monthly} onChange={e => updateDeep("incomeReplacement", { monthly: e.target.value })} placeholder={String(Math.round(d.net))} /></Field>
              <Field label="For how many years" hint={num(client.incomeReplacement.years) > 0 ? "" : "until target retirement age: " + d.yearsToRet + " years"}><NumInput value={client.incomeReplacement.years} onChange={e => updateDeep("incomeReplacement", { years: e.target.value })} placeholder={String(d.yearsToRet)} /></Field>
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
              <Field label="Years until retirement" hint={d.age > 0 && d.retAge > d.age ? "= target retirement age " + d.retAge + " − current age " + d.age : "set DOB and target retirement age in Profile to derive this"}>
                {d.age > 0 && d.retAge > d.age
                  ? <Input value={d.yearsToRet} readOnly className="bg-slate-50" />
                  : <NumInput value={client.retirement.yearsToRetire} onChange={e => updateDeep("retirement", { yearsToRetire: e.target.value })} />}
              </Field>
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
          <CurrentCoverageSection client={client} update={update} />
        </>)}

        {step === 5 && (<>
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

        {step === 6 && (<>
          <SectionCard title="Overview">
            <CoverageTimelinePanel client={client} />
          </SectionCard>
          <SectionCard title="Total Insurance Needs">
            <InsuranceNeedsSummary client={client} update={update} />
          </SectionCard>
        </>)}

        {step === 7 && (<>
          <SectionCard title="Narrative">
            <div className="mb-4">
              <button onClick={draftWithAI} disabled={drafting} className="bg-purple-700 hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors">
                {drafting ? "Drafting…" : "✦ Draft with AI"}
              </button>
              {draftError && <p className="mt-2 text-sm text-red-600">{draftError}</p>}
            </div>
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
    </div>
  );
}
