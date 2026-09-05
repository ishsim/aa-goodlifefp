import React, { useState, useEffect, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, ReferenceLine, LabelList } from "recharts";
import logoAsset from "./assets/goodlife-logo.png.asset.json";
import { generateDocx } from "@/lib/generateDocx";
import { quotePremium, RATED_PRODUCTS, PLAN_RIDERS, benefitsFor } from "@/lib/premiumRates";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { User, Wallet, Scale, Target, Shield, ClipboardList, LayoutDashboard, FileText, Save, Eye, Download, ChevronLeft, ChevronRight, Share2, RefreshCw } from "lucide-react";

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
// how old the insured person was on a given date — lets policy dates drive the age fields
const ageAtDate = (dob, when) => {
  if (!dob || !when) return "";
  const b = new Date(dob), d = new Date(when);
  if (isNaN(b) || isNaN(d)) return "";
  let a = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) a--;
  return a >= 0 ? a : "";
};
const fmtDate = (s) => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
// A policy's dates are the source of truth for its ages; the old hand-typed age fields
// stay as a fallback so plans captured before dates existed still render.
const policyStartAge = (row, dob) => { const a = ageAtDate(dob, row.policyDate); return a !== "" ? a : num(row.startAge ?? row.fromAge); };
const policyPremiumEndAge = (row, dob) => { const a = ageAtDate(dob, row.policyExpiry); return a !== "" ? a : num(row.premiumEndsAge ?? row.payUntilAge); };
// Privacy mode keeps the shape of the name — "Charma Maidin" reads as "C***** M*****" —
// which is far easier to recognise at a glance than bare initials while still masking it.
// Client-list search. Policy numbers are compared with punctuation and case stripped, so
// "Q625123456", "q62-512 3456" and "Q62 5123456" all find the same policy. A match on
// anything other than the client's own name reports why, since a client card showing only
// a name is baffling when you searched for a policy number.
const normId = (v) => String(v || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const clientSearchMatch = (c, q) => {
  const qn = q.toLowerCase();
  if ((c.name || "").toLowerCase().includes(qn)) return { ok: true };
  if ((c.occupation || "").toLowerCase().includes(qn)) return { ok: true };
  const dep = (c.dependents || []).find(dp => (dp.name || "").toLowerCase().includes(qn));
  if (dep) return { ok: true, kind: "dependent", name: dep.name, relationship: dep.relationship };
  const qid = normId(q);
  // two characters would match half the book; a policy number search is deliberate
  if (qid.length >= 3) {
    const policies = [
      ...(c.existingPlans || []).map(x => ({ no: x.policyNumber, what: x.planName || x.planType })),
      ...(c.existingInvestments || []).map(x => ({ no: x.policyNumber, what: x.description || x.type })),
    ];
    const hit = policies.find(x => normId(x.no).length > 0 && normId(x.no).includes(qid));
    if (hit) return { ok: true, kind: "policy", no: hit.no, what: hit.what };
  }
  return { ok: false };
};

// A client's overall "updated" moves whenever anything is touched, which says nothing about
// whether the numbers behind a financial health check are current. These two steps get their
// own timestamps, stamped only when their own data actually changes.
const SECTION_FIELDS = {
  income: { label: "Income", fields: ["income", "expenses"] },
  assets: { label: "Assets", fields: ["assets", "liabilities"] },
};
const sectionStamps = (before, after, at) => {
  const out = {};
  for (const [key, { fields }] of Object.entries(SECTION_FIELDS)) {
    if (fields.some(f => JSON.stringify(before[f]) !== JSON.stringify(after[f]))) out[key] = at;
  }
  return out;
};
const shortDate = (ts) => ts ? new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

const maskedName = (name) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts.map(w => w[0].toUpperCase() + "*".repeat(Math.max(w.length - 1, 0))).join(" ");
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
  GPP: { name: "Whole Life Critical Illness — Guaranteed Protect Plus", body: "Guaranteed Protect Plus is a limited-premium whole life policy providing protection against death up to age 100 and total & permanent disability up to age 70, with premium payment terms of 15 or 20 years (this proposal uses 20 years). It is a participating policy, allowing you to share in the performance of the participating fund through non-guaranteed bonuses.\n\n• Death Benefit — pays the Insured Amount plus bonuses, less amounts owing.\n• TPD Benefit — lump sum of the Insured Amount plus bonuses before age 70.\n• Minimum Death/Critical Illness Benefit — boosts coverage to 2× the insured amount up to age 65.\n• Maturity Benefit — lump sum of Insured Amount plus bonuses at age 100.\n• Bonuses — Reversionary Bonus and Terminal Bonus.\n• Option to Purchase Additional Insurance — buy new coverage without evidence of insurability on key life events (18th birthday, marriage, birth/adoption of a child, death of spouse).\n• Early Critical Protector Life (ECPL) — covers 150 medical conditions across severity stages (42 Early + 35 Intermediate + 73 Major), plus a Special Conditions benefit covering 15 conditions at 20% of the ECPL insured amount (max 5 claims).\n\nA win-win policy offering both protection and returns: a lump sum is available when there is a need to claim, easing financial burden if the unforeseen occurs, and a guaranteed surrender amount plus cash bonuses is available as a savings return (breakeven around year 25–30).\n\nPlan Limitations:\n∴ The 2× boosted coverage ends at the 65th birthday.\n∴ Once a critical illness claim is made, the plan terminates unless total insured amount (including booster) exceeds $250,000.\n∴ 90-day waiting period applies to most critical illnesses.", tables: [
    { caption: "Multi-stage conditions covered — Early Critical Protector Life",
      head: ["No", "Early Stage (42 Conditions)", "Intermediate Stage (35 Conditions)", "Major Stage (73 Conditions)"],
      widths: ["5%", "31.6%", "31.7%", "31.7%"],
      align: ["left", "left", "left", "left"],
      dense: true,
      rows: [
        ["1", "N/A", "N/A", "Acquired Brain Damage"],
        ["2", "Acute Ulcerative Colitis", "N/A", "Acute Severe Ulcerative Colitis"],
        ["3", "N/A", "N/A", "Addison disease or Autoimmune Adrenalitis"],
        ["4", "N/A", "N/A", "Adrenalectomy for Adrenal Adenoma"],
        ["5", "Diagnosis of Dementia including Alzheimer's Disease", "Moderately Severe Alzheimer's Disease", "Alzheimer's Disease / Severe Dementia"],
        ["6", "N/A", "N/A", "Angioplasty & Other Invasive Treatment for Coronary Artery"],
        ["7", "Surgical Removal of Pituitary Tumour", ["Surgical Removal of Pituitary Tumour (by Open Craniotomy)", "Surgical Removal of Pituitary Tumour (by Transsphenoidal/Transnasal Hypophysectomy)"], "Benign Brain Tumour"],
        ["8", "Biliary Atresia (on diagnosis)", "N/A", "Biliary Atresia having undergone Liver transplantation"],
        ["9", "Irreversible Loss of Sight in One Eye", "Optic Nerve Atrophy with low vision", "Blindness (Irreversible Loss of Sight)"],
        ["10", "N/A", "N/A", "Brain Surgery"],
        ["11", "N/A", "N/A", "Chronic Auto-Immune Hepatitis"],
        ["12", "Acute Necrohemorrhagic Pancreatitis", "Acute Necrohemorrhagic Pancreatitis with Pancreatectomy", "Chronic Relapsing Pancreatitis"],
        ["13", "Coma for 48 hours", ["Coma for 72 hours", "Severe Epilepsy"], "Coma"],
        ["14", "Keyhole Coronary Bypass Surgery or Coronary Artery Atherectomy or Myocardial Laser Revascularisation or Enhanced External Counterpulsation", "N/A", "Coronary Artery By-pass Surgery"],
        ["15", "Less Severe Creutzfeldt-Jakob Disease", "Moderately Severe Creutzfeldt-Jakob Disease", "Creutzfeldt-Jakob Disease"],
        ["16", ["Partial Loss of Hearing", "Cavernous Sinus Thrombosis Surgery"], "Cochlear Implant Surgery", "Deafness (Irreversible Loss of Hearing)"],
        ["17", "N/A", "N/A", "Ebola"],
        ["18", "N/A", "N/A", "Elephantiasis"],
        ["19", "Surgical Removal of One Kidney", "Chronic Kidney Disease", "End Stage Kidney Failure"],
        ["20", "Liver Surgery", "Liver Cirrhosis", "End Stage Liver Failure"],
        ["21", ["Severe Asthma", "Insertion of a Vena Cava Filter"], "Surgical Removal of One Lung", "End Stage Lung Disease"],
        ["22", ["Biliary Tract Reconstruction Surgery", "Hepatitis with Cirrhosis"], "Chronic Primary Sclerosing Cholangitis", "Fulminant Hepatitis"],
        ["23", "N/A", "N/A", "Generalized Tetanus"],
        ["24", ["Cardiac Pacemaker Insertion", "Pericardiectomy"], ["Cardiac Defibrillator Insertion", "Early Cardiomyopathy"], "Heart Attack of Specified Severity"],
        ["25", "HIV due to Assault or Occupationally Acquired HIV", "HIV due to Organ Transplant", "HIV Due to Blood Transfusion and Occupationally Acquired HIV"],
        ["26", "Early Parkinson's Disease", "Moderately Severe Parkinson's Disease", "Idiopathic Parkinson's Disease"],
        ["27", "Less Severe Infective Endocarditis", "N/A", "Infective Endocarditis"],
        ["28", "N/A", "N/A", "Insulin Dependent Diabetes Mellitus"],
        ["29", "Reversible Aplastic Anaemia", "Myelodysplastic Syndrome or Myelofibrosis", "Irreversible Aplastic Anaemia"],
        ["30", "Permanent (or Temporary) Tracheostomy", "Loss of Speech (other than injury or illness to the vocal cords)", "Irreversible Loss of Speech"],
        ["31", "N/A", "N/A", "Juvenile Huntington Disease"],
        ["32", "Loss of Independent Existence (Early Stage)", "N/A", "Loss of Independent Existence"],
        ["33", "Mild Severe Burns", "Moderately Severe Burns", "Major Burns"],
        ["34", ["Carcinoma in situ", "Early Prostate Cancer", "Early Thyroid Cancer", "Early Neuroendocrine Tumours", "Early Bladder Cancer", "Early Chronic Lymphocytic Leukaemia", "Early Melanoma", "Gastro-Intestinal Stromal Tumours", "Bone Marrow Malignancies"], "Carcinoma in situ of specified organs treated with Radical Surgery", "Major Cancer"],
        ["35", ["Surgery for Subdural Haematoma", "Facial Reconstructive Surgery"], "Intermediate Stage Major Head Trauma", "Major Head Trauma"],
        ["36", ["Small Bowel Transplant", "Corneal Transplant"], "Major Organ/Bone Marrow Transplant (on waitlist)", "Major Organ / Bone Marrow Transplantation"],
        ["37", "N/A", "N/A", "Medically Acquired HIV infection"],
        ["38", "N/A", "N/A", "Medullary Cystic Disease"],
        ["39", "Peripheral Neuropathy", "Early Motor Neurone Disease", "Motor Neurone Disease"],
        ["40", "N/A", "N/A", "Multiple Root of Branchial Plexus Injury"],
        ["41", "Early Multiple Sclerosis", "Mild Multiple Sclerosis", "Multiple Sclerosis"],
        ["42", "Spinal Cord Disease or Injury resulting in Bowel and Bladder Dysfunction", "Moderate Muscular Dystrophy", "Muscular Dystrophy"],
        ["43", "N/A", "N/A", "Necrotising Fasciitis"],
        ["44", "N/A", "N/A", "Occupationally Acquired Hepatitis B or C"],
        ["45", "Percutaneous Valvuloplasty or Valvotomy", "Percutaneous Valve Replacement or Device Repair", "Open Chest Heart Valve Surgery"],
        ["46", "Large Asymptomatic Aortic Aneurysm", "Minimally Invasive Surgery to Aorta", "Open Chest Surgery to Aorta"],
        ["47", "N/A", "N/A", "Osteogenesis Imperfecta"],
        ["48", "Early Stage Other Serious Coronary Artery Disease", "Intermediate Stage Other Serious Coronary Artery Disease", "Other Serious Coronary Artery Disease"],
        ["49", "Loss of Use of One Limb", "Loss of use of One limb requiring Prosthesis", "Paralysis (Irreversible Loss of Use of Limbs)"],
        ["50", "Severe Juvenile Rheumatoid Arthritis", "N/A", "Persistent Severe Juvenile Rheumatoid Arthritis"],
        ["51", "Locked in Syndrome", "N/A", "Persistent Vegetative State (Apallic Syndrome)"],
        ["52", "N/A", "N/A", "Pheochromocytoma"],
        ["53", "N/A", "Moderately Severe Poliomyelitis", "Poliomyelitis"],
        ["54", "Early Pulmonary Hypertension", "Secondary Pulmonary Hypertension", "Primary Pulmonary Hypertension"],
        ["55", "Early Progressive Scleroderma", "Progressive Scleroderma with CREST syndrome", "Progressive Scleroderma"],
        ["56", "Less Severe Progressive Supranuclear Palsy", "N/A", "Progressive Supranuclear Palsy"],
        ["57", "N/A", "N/A", "Rabies"],
        ["58", "N/A", "N/A", "Resection of the whole small intestine (duodenum, jejunum and ileum)"],
        ["59", "Bacterial Meningitis with full recovery", "Mild Bacterial Meningitis", "Severe Bacterial Meningitis"],
        ["60", "N/A", "N/A", "Severe Cardiomyopathy"],
        ["61", "Less Severe Crohn's Disease", "N/A", "Severe Crohn's Disease"],
        ["62", "N/A", "Severe Eisenmenger's Syndrome (Intermediate)", "Severe Eisenmenger's Syndrome"],
        ["63", "Viral Encephalitis with full recovery", "Mild Viral Encephalitis", "Severe Encephalitis"],
        ["64", "N/A", "N/A", "Severe Haemophilia"],
        ["65", "N/A", "N/A", "Severe Myasthenia Gravis"],
        ["66", "N/A", "N/A", "Severe Pulmonary Fibrosis"],
        ["67", ["Brain Aneurysm Surgery (via Endovascular procedures)", "Brain Aneurysm Surgery (via Craniotomy)", "Cerebral Shunt Insertion"], "Carotid Artery Surgery", "Stroke with Permanent Neurological Deficit"],
        ["68", "N/A", "N/A", "Surgery for Idiopathic Scoliosis"],
        ["69", "Mild Systemic Lupus Erythematosus", "Moderate Severe Systemic Lupus Erythematosus with Lupus Nephritis", "Systemic Lupus Erythematosus with Lupus Nephritis"],
        ["70", "N/A", "N/A", "Terminal Illness"],
        ["71", "N/A", "N/A", "Tuberculosis Meningitis"],
        ["72", "N/A", "N/A", "Type 1 Juvenile Spinal Muscular Atrophy"],
        ["73", "N/A", "N/A", "Wilson's Disease"],
      ] },
  ] },
  PA: { name: "Comprehensive Accident Coverage — Solitaire Personal Accident", body: "• Covers Death, Total Permanent Disability and dismemberment due to accident at a very low premium.\n• Covers broken bones and burns up to $8,000.\n• Provides stability of lifestyle in case of loss of income or unexpected expenses arising from accidental death or disability.\n\nPlan Limitations:\n∴ As a standalone accident plan, coverage is payable only upon accidental causes.\n∴ If nothing should happen, the plan does not provide any return.", tables: [
    { caption: "Basic Benefits — Insured Amount (B$)",
      head: ["Benefit", "Plan 1", "Plan 2", "Plan 3", "Plan 4"],
      widths: ["40%", "15%", "15%", "15%", "15%"],
      rows: [
        ["Accidental Death Benefit", "100,000", "250,000", "500,000", "750,000"],
        ["Accidental Dismemberment and Burns Benefit", "100,000", "250,000", "500,000", "750,000"],
        ["Accidental Permanent Total Disablement Benefit", "150,000", "375,000", "750,000", "1,125,000"],
        ["Double Indemnity for Accidental Death on Public Conveyance Benefit", "100,000", "250,000", "500,000", "750,000"],
        ["Accident Medical Reimbursement Benefit", "2,000", "3,000", "4,000", "5,000"],
        ["Traditional Chinese Medicine / Chiropractic Reimbursement Benefit", "500", "750", "1,000", "1,250"],
        ["Death Benefit", "1,000", "1,000", "1,000", "1,000"],
      ] },
    { caption: "Optional: Lifestyle Maintenance Benefits Group",
      head: ["Benefit", "Plan 1", "Plan 2", "Plan 3", "Plan 4"],
      widths: ["40%", "15%", "15%", "15%", "15%"],
      rows: [
        ["Weekly Income Benefit", "100", "200", "300", "400"],
        ["Mobility Aids Reimbursement Benefit", "1,000", "1,000", "2,000", "2,000"],
        ["Home Modification Reimbursement Benefit", "5,000", "10,000", "15,000", "20,000"],
        ["Family Support Fund Benefit", "30,000", "60,000", "100,000", "150,000"],
      ] },
    { caption: "Optional: Accidental Hospitalisation Benefits Group",
      head: ["Benefit", "Plan 1", "Plan 2", "Plan 3", "Plan 4"],
      widths: ["40%", "15%", "15%", "15%", "15%"],
      rows: [
        ["Daily Accidental Hospital Income Benefit", "50", "150", "250", "350"],
        ["Daily Accidental Intensive Care Unit (ICU) Benefit", "50", "150", "250", "350"],
        ["Ambulance Services Benefit", "200", "200", "200", "200"],
        ["Broken Bones Benefit", "8,000", "12,000", "16,000", "20,000"],
        ["Emergency Medical Evacuation and Repatriation Benefit", "10,000", "25,000", "50,000", "75,000"],
      ] },
  ], tablesNote: "Each optional group is issued at the same plan type as the basic benefits." },
  MSCC: { name: "Comprehensive Cancer Coverage — MultiStage Cancer Cover", body: "• A critical illness plan specially designed to provide coverage for Major Cancer at early, intermediate and major stages.\n• Acts as income protection so you have funding to continue your standard of living upon diagnosis.\n• Level premium for 20 years.\n\nPlan Limitations:\n∴ Cancer benefit is payable only once; the policy terminates upon diagnosis of any covered stage resulting in payout.\n∴ As a standalone cancer plan, coverage is payable only upon diagnosis of Cancer.\n∴ If nothing should happen, the plan does not provide any return.", tables: [
    { caption: "Basic Benefits — Insured Amount (S$)",
      head: ["No", "Basic Benefits", "Plan 1", "Plan 2", "Plan 3"],
      widths: ["6%", "34%", "20%", "20%", "20%"],
      align: ["center", "left", "right", "right", "right"],
      rows: [["1", "Cancer Benefit", "$100,000", "$150,000", "$250,000"],
             ["2", "Death Benefit", "$1,000", "$1,000", "$1,000"]] },
    { caption: "What counts as a claim at each stage",
      head: ["Early Stage", "Intermediate Stage", "Major Stage"],
      widths: ["34%", "33%", "33%"],
      dense: true,
      rows: [[
        [{ t: "Carcinoma in situ (CIS)" },
         { p: "CIS means the focal autonomous new growth of carcinomatous cells confined to the cells in which it originated and has not yet result in invasion and destruction of surrounding tissues." },
         { t: "EXCLUSIONS:" },
         { ul: ["CIS of the skin and biliary system.", "Early Prostate Cancer", "Early Thyroid Cancer", "Early Neuroendocrine Tumours", "Early Bladder Cancer", "Early Chronic Lymphocytic Leukaemia", "Early Melanoma", "Gastro-Intestinal Stromal Tumours", "Bone Marrow Malignancies"] },
         { p: "Diagnosis of the above early cancers must be established by histological evidence and confirmed by Specialist in the relevant field." }],
        [{ t: "Carcinoma in situ of specified organs treated with Radical Surgery." },
         { p: "Radical Surgery is defined as the total and complete removal or partial removal of one of the following organs as specified: breast, prostate, corpus uteri, ovary, fallopian tube, colon, or stomach." }],
        [{ t: "Major Cancer" },
         { p: "Malignant tumour positively diagnosed with histological confirmation." },
         { p: "Also characterised by the uncontrolled growth of malignant cells with invasion and destruction of normal tissues." }],
      ]] },
  ],
  tablesNote: "Further definitions can be found in the MultiStage Cancer Cover Product Summary." },
  HI: { name: "Hospital Confinement Pay-Out — Hospital Income", body: "• Provides a cash payout for each day of hospital confinement (in Brunei Darussalam or overseas) due to injury or sickness.\n• Provides a get-well benefit after discharge.\n• Daily cash provision if required to undergo day surgery or recuperate as an outpatient following discharge.\n\nPlan Limitations:\n∴ As a standalone hospitalisation plan, coverage is payable only upon hospitalisation (admission to a hospital bed for at least 6 hours).\n∴ If nothing should happen, the plan does not provide any return.", tables: [
    { caption: "Coverage — Insured Amount (B$)",
      head: ["Benefit", "Plan 1", "Plan 2", "Plan 3"],
      widths: ["46%", "18%", "18%", "18%"],
      rows: [
        ["Daily Hospital Income Benefit", "100/day", "200/day", "300/day"],
        ["Intensive Care Unit Benefit", "300/day", "450/day", "750/day"],
        ["Get Well Benefit", "200", "300", "400"],
        ["Post-Hospitalisation Home Rest Benefit", "50/day", "100/day", "150/day"],
        ["Day Surgery Income Benefit", "200/day", "350/day", "500/day"],
        ["Death Benefit", "1,000", "1,000", "1,000"],
      ] },
  ] },
  SA: { name: "Comprehensive Accident & Specific Diseases Coverage — Star Armour", body: "AIA Star Armour is an accident and health plan for juveniles aged 16 and below at application, combining accident cover with protection against specific childhood diseases.\n\n\u2022 Accidental Death, Dismemberment and Burns \u2014 pays the insured amount, with double indemnity if the accident happens during school activities, on public or private conveyance, or as a pedestrian.\n\u2022 Monthly Catastrophe Cash Benefit \u2014 a monthly payout for up to 20 years if a catastrophic disability results from an accident.\n\u2022 Medical Reimbursement (Accident & Disease) \u2014 reimburses treatment costs including nursing and ambulance charges, plus TCM/chiropractic up to 10% of the benefit.\n\u2022 Daily Hospital Income (Accident & Disease) \u2014 paid for each day of hospitalisation up to 180 days, doubled while in intensive care.\n\u2022 Recuperation Benefit \u2014 pays out on diagnosis of Dengue Fever or Hand, Foot & Mouth Disease.\n\u2022 Education Assurance Fund \u2014 pays out on accidental death of the policyowner, protecting the child\u2019s education.\n\u2022 Optional Child Critical Illnesses Benefit \u2014 available at B$30,000, B$50,000 or B$100,000, convertible later to a whole life or endowment policy without further underwriting.\n\nPlan Limitations:\n\u2234 Entry is limited to juveniles aged 16 and below.\n\u2234 Disease-related benefits apply only to the specific diseases named in the policy contract.\n\u2234 If nothing should happen, the plan does not provide any return.", tables: [
    { caption: "Basic Benefits — Sum Assured (B$)",
      head: ["Plan Type", "Plan 1", "Plan 2", "Plan 3"],
      widths: ["49%", "17%", "17%", "17%"],
      dense: true,
      rows: [
        [[{ h: "Accidental Death, Accidental Dismemberment and Burns Benefit" }, { p: "Refer to the Schedule of Indemnity in the policy contract" }], "20,000", "35,000", "100,000"],
        [[{ h: "Double Indemnity for Dismemberment and Burns Benefit" }, { p: "Pays when your child is injured in an accident that happened at school, on public/private conveyances or as a pedestrian on the road" }], "20,000", "35,000", "100,000"],
        [[{ h: "Monthly Catastrophe Cash Benefit (Accident)" }, { p: "Pays up to 20 years upon a catastrophic disability" }], "750/month", "1,000/month", "1,500/month"],
        [[{ h: "Medical Reimbursement Benefit (Accident & Disease)" }, { p: "Pays for medical expenses including:" }, { ul: ["Hiring a licensed/graduate nurse — up to sum assured", "Ambulance charges — up to B$200", "Traditional Chinese medicine/chiropractic treatments — up to 10% of sum assured"] }], "1,500", "3,000", "5,000"],
        [[{ h: "Daily Hospital Income Benefit (Accident & Disease)" }, { p: "Pays up to 180 days" }], "30/day", "50/day", "100/day"],
        [[{ h: "Double Indemnity for Daily Hospital Income Benefit in ICU (Accident & Disease)" }, { p: "Pays up to 30 days" }], "30/day", "50/day", "100/day"],
        [[{ h: "Post-Hospitalisation Home Care Benefit (Accident & Disease)" }, { p: "Pays when your child is required to stay in a hospital for more than 4 consecutive days. Maximum one claim per accident or disease" }], "100", "150", "200"],
        [[{ h: "Recuperation Benefit (Dengue Fever and Hand, Foot & Mouth Disease)" }, { p: "Maximum one claim every 2 years" }], "50", "80", "100"],
        [[{ h: "Education Assurance Fund Benefit" }, { ul: ["Pays upon accidental death of payor (before payor's 75th birthday; before the policy anniversary following child's 21st birthday [if child is no longer a student] or child's 24th birthday, whichever is earliest)", "Pays upon accidental death of child (after the coverage for payor ceases)"] }], "10,000", "17,500", "50,000"],
        [[{ h: "Reconstructive Surgery Reimbursement Benefit (Accident)" }, { ul: ["Reconstructive surgery", "Skin transplantation"] }], "NIL", "5,000", "15,000"],
        [[{ h: "Mobility Aids Reimbursement Benefit (Accident)" }, { p: "Pays when your child needs mobility aids" }], "NIL", "300", "1,000"],
        [[{ h: "Emergency Medical Evacuation & Repatriation Benefit (Accident)" }, { p: "Covers while travelling overseas or outside of the home country" }], "NIL", "NIL", "50,000 per policy year"],
        [[{ h: "Payor Benefit" }, { p: "Waives future premiums until your child reaches 21 years old should you pass away due to an accident before age 75" }]],
        [[{ h: "Renewal Bonus" }, { p: "Provides additional 5% of sum assured for Accidental Death, Accidental Dismemberment and Burns Benefit for each policy renewal, up to a maximum of 5 renewals." }]],
        [[{ h: "Death Benefit" }, { p: "If the insured passes away and no claim has been paid under the Accidental Death, Accidental Dismemberment and Burns Benefit, we will pay the amount of cover. The amount payable under this benefit shall not exceed $1,000 regardless of the number of AIA Star Armour policies insured under." }]],
      ] },
    { caption: "Optional Benefit — Sum Assured (B$)",
      head: ["Optional Benefit", "Option 1", "Option 2", "Option 3"],
      widths: ["49%", "17%", "17%", "17%"],
      dense: true,
      rows: [
        [[{ h: "Child Critical Illnesses Benefit" }, { ul: ["Covers 17 Child Critical Illnesses", "Option to convert this benefit to an AIA whole life or endowment policy from your child's 18th birthday till the policy anniversary following your child's 21st birthday"] }, { p: "This benefit will terminate on the policy anniversary following the child's 21st birthday." }], "30,000", "50,000", "100,000"],
      ] },
  ] },
  CPA: { name: "Comprehensive Accident & Dementia Coverage — Centurion PA", body: "AIA Centurion PA is a personal accident plan designed for individuals aged 40 to 80, providing 24/7 worldwide coverage through to age 100, with an optional dementia benefit group.\n\n\u2022 Accidental Death, Dismemberment and Burns \u2014 with an additional dismemberment and burns benefit on top of the base amount.\n\u2022 Fractures Benefit \u2014 a dedicated payout for fractures, which become materially more likely with age.\n\u2022 Loss of Activities of Daily Living Benefit \u2014 pays out when an accident leaves the insured unable to perform daily activities.\n\u2022 Accidental Medical Reimbursement \u2014 including an extra reimbursement specifically for fractures, plus TCM/chiropractic and ambulance cover.\n\u2022 Daily Accidental Hospital Income and Post-Hospitalisation Home Care \u2014 support during recovery.\n\u2022 Mobility Aid and Home Modification Reimbursement \u2014 helps adapt the home after a disabling accident.\n\u2022 Optional Dementia Benefits Group \u2014 a lump sum on diagnosis of dementia plus a care reimbursement benefit; entry before age 70, covering to age 85.\n\nPlan Limitations:\n\u2234 Entry ages are 40 to 80; ages 81 and above are renewal only.\n\u2234 The dementia option must be the same plan tier as the basic benefits or lower, and terminates at age 85.\n\u2234 As an accident plan, the main benefits are payable only on accidental causes \u2014 the dementia group is the exception.\n\u2234 If nothing should happen, the plan does not provide any return.", tables: [
    { caption: "Basic Benefits — Insured Amount (S$)",
      head: ["Benefit", "Plan 1", "Plan 2", "Plan 3"],
      widths: ["46%", "18%", "18%", "18%"],
      rows: [
        ["Accidental Death Benefit", "30,000", "60,000", "100,000"],
        ["Accidental Dismemberment and Burns Benefit", "30,000", "60,000", "100,000"],
        ["Additional Accidental Dismemberment and Burns Benefit", "30,000", "60,000", "100,000"],
        ["Fractures Benefit", "10,000", "15,000", "30,000"],
        ["Loss of Activities of Daily Living Benefit", "20,000", "30,000", "60,000"],
        ["Accidental Medical Reimbursement Benefit", "1,000", "2,000", "3,000"],
        ["Extra Accidental Medical Reimbursement Benefit (Fractures)", "1,000", "2,000", "3,000"],
        ["TCM / Chiropractic Medical Reimbursement Benefit", "250", "500", "750"],
        ["Ambulance Services Benefit", "200", "200", "200"],
        ["Daily Accidental Hospital Income Benefit", "50", "100", "150"],
        ["Post-Hospitalisation Home Care Benefit", "800", "1,000", "1,200"],
        ["Mobility Aid Reimbursement Benefit", "250", "500", "750"],
        ["Home Modification Reimbursement Benefit", "5,000", "10,000", "15,000"],
        ["Death Benefit", "1,000", "1,000", "1,000"],
      ] },
    { caption: "Optional: Dementia Benefits Group — Insured Amount (S$)",
      head: ["Benefit", "Plan 1", "Plan 2", "Plan 3"],
      widths: ["46%", "18%", "18%", "18%"],
      rows: [
        ["Dementia Benefit", "30,000", "50,000", "100,000"],
        ["Dementia Care Reimbursement Benefit", "6,000", "10,000", "20,000"],
      ] },
  ], tablesNote: "The dementia option must be taken at the same plan type as the basic benefits, or lower." },
  STP: { name: "Income Protection — Secure Term Plus", body: "• A term coverage plan providing high insurance coverage against death, total permanent disability and terminal illness for relatively low premiums.\n• Premiums are level for the initial 5, 10 or 20 years (this proposal locks in 20 years).\n• Acts as income protection to maintain your standard of living, and as credit protection against any liabilities.\n• Critical illness coverage is optional.\n• Convertible to a whole life plan in the future regardless of medical condition at that time — conversion is based on your health condition as of now.\n\nPlan Limitations:\n∴ Premiums become higher after the initial level-premium period.", tables: [
    { caption: "Critical Illnesses covered under this supplementary benefit",
      rider: "ci",
      head: ["Covered conditions (1–22)", "Covered conditions (23–43)"],
      widths: ["50%", "50%"],
      align: ["left", "left"],
      plainList: true,
      dense: true,
      rows: [[["1. Acute Necrohemorrhagic Pancreatitis", "2. Alzheimer's Disease / Severe Dementia", "3. Angioplasty & Other Invasive Treatment for Coronary Artery *", "4. Apallic Syndrome", "5. Aplastic Anaemia", "6. Bacterial Meningitis", "7. Benign Brain Tumour", "8. Blindness (Loss of Sight)", "9. Coma", "10. Coronary Artery By-pass Surgery", "11. Creutzfeld-Jacob Disease", "12. Deafness (Loss of Hearing)", "13. Elephantiasis", "14. End Stage Liver Failure", "15. End Stage Lung Disease", "16. Fulminant Hepatitis", "17. Heart Attack of Specified Severity", "18. Heart Valve Surgery", "19. HIV Due to Blood Transfusion and Occupationally Acquired HIV", "20. Kidney Failure", "21. Loss of Independent Existence", "22. Loss of Speech"], ["23. Major Burns", "24. Major Cancers", "25. Major Head Trauma", "26. Major Organ / Bone Marrow Transplantation", "27. Medullary Cystic Disease", "28. Motor Neurone Disease", "29. Multiple Sclerosis", "30. Muscular Dystrophy", "31. Necrotising Fasciitis", "32. Other Serious Coronary Artery Disease", "33. Paralysis (Loss of Use of Limbs)", "34. Parkinson's Disease", "35. Poliomyelitis", "36. Primary Pulmonary Hypertension", "37. Progressive Scleroderma", "38. Progressive Supranuclear Palsy", "39. Severe Myasthenia Gravis", "40. Stroke", "41. Surgery to Aorta", "42. Systemic Lupus Erythematosus with Lupus Nephritis", "43. Viral Encephalitis"]]] },
  ], tablesNote: "* If the Insured undergoes Angioplasty & Other Invasive Treatment for Coronary Artery, we will pay 10% of the Insured Amount of this supplementary benefit (subject to a maximum of S$25,000). That benefit is payable once during the term of the supplementary benefit and ceases automatically upon payment, after which the Insured Amount of this supplementary benefit is reduced by the amount paid." },
  ILP: { name: "Investment with Unit Trusts — Optimizer", body: "Optimizer is a flexible investment-linked life insurance plan combining protection and investment to enhance returns for your goals while keeping income protection in place. Returns are not guaranteed, as they depend on market performance — a longer time horizon allows you to withstand investment fluctuations.\n\n• Vary your protection and investment mix without changing your premium.\n• Sum assured is flexible — increase or decrease within limits to match your protection needs.\n• Premiums convert to units invested in a choice of Asia Equity and Global Bond unit trusts.\n• Top-up available anytime (minimum $1,000) to increase portfolio returns.\n• Total payable upon death or permanent disability is the Sum Assured plus the present policy cash value.\n• Fixed minimum of 8 paying years — acts as a forced savings system; thereafter you may continue or stop payment depending on your needs.\n\nPlan Limitations:\n∴ Insurance charges increase with age, which may reduce future returns.\n∴ Regular premium is locked for 8 years — no withdrawal or surrender during this period.\n∴ Penalty charges apply for late premiums, early surrender or partial withdrawal before completing 8 paying years.\n∴ Returns are not guaranteed and vary directly with the investment climate.\n∴ A Full Surrender Charge applies: the Regular Premium policy value is multiplied by a surrender factor based on the number of full annual premiums paid, starting at 95% after one year and tapering to 0% once eight have been paid — see the table below.\n∴ A Partial Surrender Charge is deducted from the remaining policy value, calculated as number of Regular Premium units withdrawn x bid price x A / (1 - A), where A is the same surrender factor.", tables: [
    { caption: "Surrender Charge — Surrender Factor by premiums paid",
      sub: "Applies to both the Full and Partial Surrender Charge.",
      head: ["Number of Full Annual Premiums Paid", "Surrender Factor"],
      widths: ["62%", "38%"],
      align: ["left", "center"],
      rows: [["1", "95%"], ["2", "85%"], ["3", "65%"], ["4", "40%"],
             ["5", "30%"], ["6", "25%"], ["7", "15%"], ["8 +", "0%"]] },
  ], tablesNote: "The number of full annual premiums used to find the Surrender Factor is based on the original amount of Regular Premiums payable." },
  ASCC: { name: "Comprehensive Critical Illness + Special Conditions — Absolute Critical Cover", body: "Absolute Critical Cover is a standalone regular premium, non-participating critical illness plan providing coverage against death, critical illnesses of different severities including Pre-Early conditions, and Special Conditions.\n\n• 187 total conditions covered — going beyond standard critical illness plans.\n• 150 Multi-Stage Critical Illnesses across Early Stage (42), Intermediate Stage (35) and Major Stage (73).\n• Pre-Early Benefit — 12 Pre-Early conditions (including severe hypertension, thyroid disorders, macular degeneration) trigger a payout of 10% of the insured amount or Maximum Claim Limit, up to the policy anniversary on or following age 85.\n• Special Conditions Benefit — 25 covered special conditions (including ADHD, ASD, diabetic complications, Kawasaki disease, osteoporosis, COPD, severe gout) pay 20% of the insured amount per condition. Maximum 10 claims; each condition claimable once; payments do not reduce the insured amount.\n• Safety Net Benefit — if admitted to ICU for at least 4 days, a one-time additional 20% of coverage amount is paid, covering all illnesses, injuries and conditions including future unknown diseases.\n• Power Reset — if the policy is in force 12 months after a claimed diagnosis, the Current Insured Amount is restored to 100%.\n• Power Relapse Benefit — if diagnosed with a Power Relapse Critical Illness (recurred heart attack, recurred stroke, re-diagnosed major cancer, repeated heart valve surgery, repeated major organ/bone marrow transplantation), 100% of the Current Insured Amount is paid out (200% total). 2-year waiting period applies.\n• Early Critical Protector Waiver of Premium — premiums are waived if diagnosed with a covered critical illness while the supplementary benefit is in force.\n• Payor Benefit (juvenile/child policy) — if the payor is diagnosed with Early, Intermediate or Major CI, dies, or becomes totally and permanently disabled, all future premiums are waived until end of premium term or insured's age 25, whichever is earlier.\n• Death Benefit — 5% of the Insured Amount paid upon death while policy is in force.\n• Surrender Benefit (Life Plan only) — after the 60th policy anniversary or insured's 75th birthday (whichever is earlier): 75% of insured amount less any CI benefits paid, plus an additional 1% per policy anniversary after the insured's 76th birthday.\n\nCoverage options: Value Plan to Age 65, Value Plan to Age 75, or Life Plan to Age 100.\n\nPlan Limitations:\n∴ No benefits for any CI stage or conditions within 90 days from date of issue or reinstatement.\n∴ Power Reset only applies after 1 year following claimed diagnosis.\n∴ Power Relapse Benefit has a 2-year waiting period.\n∴ Pre-Early Benefit covers only until policy anniversary on or immediately following insured's 85th birthday.\n∴ No surrender returns until 60th policy anniversary or 75th birthday.\n∴ No surrender returns if any CI benefit has been paid.\n∴ Child premium discount only until policy anniversary on or immediately following insured's 21st birthday.", tables: [
    { caption: "150 Multi-Stage Critical Illnesses — conditions covered",
      sub: "Critical illness is claimable up to 5 times under this plan.",
      head: ["No", "Critical Illness", "Early Stage", "Intermediate Stage", "Major Stage"],
      widths: ["5%", "51%", "14.6%", "14.7%", "14.7%"],
      align: ["left", "left", "center", "center", "center"],
      dense: true,
      rows: [
        ["1", "Acquired Brain Damage", "N/A", "N/A", "\u2713"],
        ["2", "Acute Severe Ulcerative Colitis", "\u2713", "N/A", "\u2713"],
        ["3", "Addison disease or Autoimmune Adrenalitis", "N/A", "N/A", "\u2713"],
        ["4", "Adrenalectomy for Adrenal Adenoma", "N/A", "N/A", "\u2713"],
        ["5", "Alzheimer's Disease / Severe Dementia", "\u2713", "\u2713", "\u2713"],
        ["6", "Angioplasty & Other Invasive Treatment for Coronary Artery", "N/A", "N/A", "\u2713"],
        ["7", "Benign Brain Tumour", "\u2713", "\u2713", "\u2713"],
        ["8", "Biliary Atresia", "\u2713", "N/A", "\u2713"],
        ["9", "Blindness (Irreversible Loss of Sight)", "\u2713", "\u2713", "\u2713"],
        ["10", "Brain Surgery", "N/A", "N/A", "\u2713"],
        ["11", "Chronic Auto-Immune Hepatitis", "N/A", "N/A", "\u2713"],
        ["12", "Chronic Relapsing Pancreatitis", "\u2713", "\u2713", "\u2713"],
        ["13", "Coma", "\u2713", "\u2713", "\u2713"],
        ["14", "Coronary Artery By-pass Surgery", "\u2713", "N/A", "\u2713"],
        ["15", "Creutzfeldt-Jakob Disease", "\u2713", "\u2713", "\u2713"],
        ["16", "Deafness (Irreversible Loss of Hearing)", "\u2713", "\u2713", "\u2713"],
        ["17", "Ebola", "N/A", "N/A", "\u2713"],
        ["18", "Elephantiasis", "N/A", "N/A", "\u2713"],
        ["19", "End Stage Kidney Failure", "\u2713", "\u2713", "\u2713"],
        ["20", "End Stage Liver Failure", "\u2713", "\u2713", "\u2713"],
        ["21", "End Stage Lung Disease", "\u2713", "\u2713", "\u2713"],
        ["22", "Fulminant Hepatitis", "\u2713", "\u2713", "\u2713"],
        ["23", "Generalized Tetanus", "N/A", "N/A", "\u2713"],
        ["24", "Heart Attack of Specified Severity", "\u2713", "\u2713", "\u2713"],
        ["25", "HIV due to Blood Transfusion and Occupationally Acquired HIV", "\u2713", "\u2713", "\u2713"],
        ["26", "Idiopathic Parkinson's Disease", "\u2713", "\u2713", "\u2713"],
        ["27", "Infective Endocarditis", "\u2713", "N/A", "\u2713"],
        ["28", "Insulin Dependent Diabetes Mellitus", "N/A", "N/A", "\u2713"],
        ["29", "Irreversible Aplastic Anaemia", "\u2713", "\u2713", "\u2713"],
        ["30", "Irreversible Loss of Speech", "\u2713", "\u2713", "\u2713"],
        ["31", "Juvenile Huntington Disease", "N/A", "N/A", "\u2713"],
        ["32", "Loss of Independent Existence", "\u2713", "N/A", "\u2713"],
        ["33", "Major Burns", "\u2713", "\u2713", "\u2713"],
        ["34", "Major Cancer", "\u2713", "\u2713", "\u2713"],
        ["35", "Major Head Trauma", "\u2713", "\u2713", "\u2713"],
        ["36", "Major Organ / Bone Marrow Transplantation", "\u2713", "\u2713", "\u2713"],
        ["37", "Medically Acquired HIV infection", "N/A", "N/A", "\u2713"],
        ["38", "Medullary Cystic Disease", "N/A", "N/A", "\u2713"],
        ["39", "Motor Neurone Disease", "\u2713", "\u2713", "\u2713"],
        ["40", "Multiple Root of Brachial Plexus Injury", "N/A", "N/A", "\u2713"],
        ["41", "Multiple Sclerosis", "\u2713", "\u2713", "\u2713"],
        ["42", "Muscular Dystrophy", "\u2713", "\u2713", "\u2713"],
        ["43", "Necrotising Fasciitis", "N/A", "N/A", "\u2713"],
        ["44", "Occupationally Acquired Hepatitis B or C", "N/A", "N/A", "\u2713"],
        ["45", "Open Chest Heart Valve Surgery", "\u2713", "\u2713", "\u2713"],
        ["46", "Open Chest Surgery to Aorta", "\u2713", "\u2713", "\u2713"],
        ["47", "Osteogenesis Imperfecta", "N/A", "N/A", "\u2713"],
        ["48", "Other Serious Coronary Artery Disease", "\u2713", "\u2713", "\u2713"],
        ["49", "Paralysis (Irreversible Loss of use of limbs)", "\u2713", "\u2713", "\u2713"],
        ["50", "Persistent Severe Juvenile Rheumatoid Arthritis", "\u2713", "N/A", "\u2713"],
        ["51", "Persistent Vegetative State (Apallic Syndrome)", "\u2713", "N/A", "\u2713"],
        ["52", "Pheochromocytoma", "N/A", "N/A", "\u2713"],
        ["53", "Poliomyelitis", "N/A", "\u2713", "\u2713"],
        ["54", "Primary Pulmonary Hypertension", "\u2713", "\u2713", "\u2713"],
        ["55", "Progressive Scleroderma", "\u2713", "\u2713", "\u2713"],
        ["56", "Progressive Supranuclear Palsy", "\u2713", "N/A", "\u2713"],
        ["57", "Rabies", "N/A", "N/A", "\u2713"],
        ["58", "Resection of the whole small intestine (duodenum, jejunum, and ileum)", "N/A", "N/A", "\u2713"],
        ["59", "Severe Bacterial Meningitis", "\u2713", "\u2713", "\u2713"],
        ["60", "Severe Cardiomyopathy", "N/A", "N/A", "\u2713"],
        ["61", "Severe Crohn's Disease", "\u2713", "N/A", "\u2713"],
        ["62", "Severe Eisenmenger's Syndrome", "N/A", "\u2713", "\u2713"],
        ["63", "Severe Encephalitis", "\u2713", "\u2713", "\u2713"],
        ["64", "Severe Haemophilia", "N/A", "N/A", "\u2713"],
        ["65", "Severe Myasthenia Gravis", "N/A", "N/A", "\u2713"],
        ["66", "Severe Pulmonary Fibrosis", "N/A", "N/A", "\u2713"],
        ["67", "Stroke with Permanent Neurological Deficit", "\u2713", "\u2713", "\u2713"],
        ["68", "Surgery for Idiopathic Scoliosis", "N/A", "N/A", "\u2713"],
        ["69", "Systemic Lupus Erythematosus with Lupus Nephritis", "\u2713", "\u2713", "\u2713"],
        ["70", "Terminal Illness", "N/A", "N/A", "\u2713"],
        ["71", "Tuberculosis Meningitis", "N/A", "N/A", "\u2713"],
        ["72", "Type 1 Juvenile Spinal Muscular Atrophy", "N/A", "N/A", "\u2713"],
        ["73", "Wilson's Disease", "N/A", "N/A", "\u2713"],
        ["", "Total", "42", "35", "73"],
      ] },
    { caption: "Pre-Early Benefit — covered until the end of the coverage term or age 85, whichever is earlier",
      head: ["Benefit", "Payout"],
      widths: ["66%", "34%"],
      align: ["left", "left"],
      dense: true,
      rows: [
        [[{ h: "Chronic Disease Benefit" }, { ul: ["Age-related macular degeneration with visual impairment", "Psoriatic arthritis", "Severe Hypertension", "Severe Obstructive or Mixed Sleep Apnoea", "Severe presbycusis (Age-related hearing loss)", "Thyroid disorders", "Varicose veins requiring surgery"] }], "Additional 10% of coverage amount, up to S$10,000 with a max. of 1 claim"],
        [[{ h: "Benign Tumour and Borderline Malignant Tumour Benefit" }, { p: "Benign Tumour (suspected malignancy) requiring surgical excision to specified organs:" }, { ol: ["Heart", "Liver", "Lung", "Pancreas", "Pericardium", "Ureter", "Adrenal Gland", "Bone", "Conjunctiva", "Kidney", "Nerve in cranium or spine", "Pituitary gland", "Small intestine", "Testis", "Breast", "Ovary", "Penis", "Uterus (covers endometrial polyps only)", "Nasopharyngeal", "Esophagus", "Oral Cavity", "Gallbladder"] }, { p: "Borderline Malignant Tumour" }], "Additional 10% of coverage amount, up to S$25,000 with a max. of 1 claim"],
        [[{ h: "Senior Silver Benefit (from age 51 onwards)" }, { ul: ["Benign prostatic hyperplasia requiring surgery", "Glaucoma requiring surgery", "Urinary incontinence requiring surgical repair"] }], "Additional 10% of coverage amount, up to S$25,000 with a max. of 1 claim"],
      ] },
    { caption: "Special Conditions Benefit — covered until the end of the coverage term or age 85, whichever is earlier",
      head: ["Special Conditions", "Payout"],
      widths: ["66%", "34%"],
      align: ["left", "left"],
      dense: true,
      rows: [
        [[{ ul: ["Attention-deficit hyperactivity disorder (ADHD)", "Autism Spectrum Disorder (ASD)", "Chronic pancreatitis due to obstruction of pancreatic duct", "Congenital Septal Defect requiring surgery", "Dengue Haemorrhagic Fever", "Diabetic Complications", "Dyslexia", "Gastrointestinal Disease with surgery", "Glomerulonephritis with nephrotic syndrome", "Hysterectomy due to cancer", "Idiopathic Pulmonary fibrosis", "Kawasaki Disease with Heart Complications", "Mastectomy due to carcinoma-in situ or malignant breast condition", "Necrotising Fasciitis requiring surgery", "Osteoporosis", "Pulmonary Embolism", "Rheumatic Fever with Heart Involvement", "Severe Central Sleep Apnoea", "Severe chronic obstructive pulmonary disease (COPD)", "Severe Gout", "Severe Rheumatoid Arthritis", "Spinal Disease requiring surgery", "Tourette syndrome (TS)", "Vulvectomy due to cancer", "Wolff-Parkinson-White and Supraventricular Tachycardia (SVT) with surgical intervention"] }], "Additional 20% of coverage amount, up to S$25,000 per claim for each respective condition, with a max. of 10 claims for different conditions"],
      ] },
    { caption: "Power Relapse Benefit — conditions covered",
      head: ["Power Relapse Critical Illnesses", "Payout"],
      widths: ["66%", "34%"],
      align: ["left", "left"],
      dense: true,
      rows: [
        [[{ ul: ["Recurred Heart Attack", "Recurred Stroke", "Re-diagnosed Major Cancer", "Repeated Heart Valve Surgery", "Repeated Major Organ/Bone Marrow Transplantation"] }], "Up to 200% of coverage amount"],
      ] },
  ], tablesNote: "Only 10% of the coverage amount is paid out for Angioplasty & Other Invasive Treatment for Coronary Artery, capped at S$25,000. Pre-Early and Special Conditions payouts are capped across all AIA ASCC plans per life. Refer to the product summary for full definitions of all covered conditions." },
  RS: { name: "Guaranteed Annuity Income — Retirement Saver (IV)" , body: "Retirement Saver (IV) is an endowment annuity insurance policy designed to provide a guaranteed monthly stream of retirement income from your chosen Retirement Age, plus coverage against death. It is a participating policy with non-guaranteed dividends.\n\n• Choose Retirement Age of 55, 60 or 65; pay premiums as a single payment or until 5 years before Retirement Age; receive Retirement Income for a 15-year payout period.\n• Retirement Income — paid monthly over the selected payout period, starting one month after the policy anniversary following your Retirement Age.\n• Monthly Dividends — declared yearly and credited monthly; once credited, they form part of the guaranteed benefits. Withdraw them or leave to accumulate interest.\n• Terminal Dividend — non-guaranteed, payable upon claim, maturity or surrender.\n• Maturity Benefit — the final income payout plus accumulated dividends and rewards, after deducting amounts owing." },
  SWB: { name: "Wealth Accumulation — AIA Smart Wealth Builder (II)", body: "AIA Smart Wealth Builder (II) is a participating endowment plan designed to help you maximise your savings. You may pay a Single Premium, or spread premiums over 5, 10, 15 or 20 years. For this proposal, we set the plan at 20-year premium duration. Your policy continues to accumulate until it matures on the policy anniversary on or after the Insured turns 125 years old. It is a participating life insurance policy, which allows the policyholder to participate in the performance of the participating fund in the form of bonuses that are not guaranteed.\n\n• Death Benefit — In the event of death of the Insured, we will pay the higher of (a) 105% of total premiums paid on the basic policy, or (b) 101% of the guaranteed cash value plus any bonuses not surrendered, after deducting any amounts owing to us.\n• Total & Permanent Disability (TPD) Benefit — In the event of TPD of the Insured before the policy anniversary occurring on or immediately following the Insured's 70th birthday, we will pay, in one lump sum, the death benefit under the basic policy.\n• Maturity Benefit — If the Insured is alive on the maturity date while the policy is in force, we will pay the guaranteed cash value plus any bonuses added which you have not surrendered, after deducting any amounts owing to us.\n• Surrender Value — You may fully or partially surrender your policy for its cash value. Partial surrender works by reducing the Insured Amount: you receive the same percentage of the Total Surrender Value as the percentage reduction in Insured Amount, and the policy continues with the reduced Insured Amount — future bonuses and any remaining premiums are based on the revised amount. This can be done anytime once the policy has cash value, subject to the minimum Insured Amount for your premium term. Your policy will automatically terminate once fully surrendered.\n• Bonuses — You can receive bonuses in the form of Reversionary Bonus (RB) and Terminal Bonus (TB). At a Projected Investment Rate of Return of 4.25% p.a., RB is projected at $6 per $1,000 Insured Amount annually from the end of the 3rd policy year, compounding at 2.50%. TB is a non-guaranteed bonus payable on claim, maturity or surrender, projected to scale from 16% of accumulated RB in policy years 3–9 up to more than 308% from year 51 onward.\n• Secondary Insured Option — A Secondary Insured (the policyholder/assignee, or their spouse or child under 16) can be appointed to continue the policy as the new Insured upon the original Insured's death, instead of paying out the death benefit. The maturity date remains unchanged — useful for passing this savings plan to the next generation without disrupting it.\n\nPlan Limitations:\n∴ Partial surrender (via reduction in Insured Amount) requires the resulting Insured Amount to stay above a minimum — $30,000 for a 20-pay plan in policy years 1–15, tightening to $10,000 for all premium terms from policy year 16 onward. Once the Insured Amount is reduced to $10,000, no further partial withdrawal can be made — only a full surrender remains available.\n∴ Early surrender may return a value that is zero or less than total premiums paid.\n∴ Secondary Insured cannot be appointed once a beneficiary nomination or trust exists on the policy, and must be under age 50 at appointment.\n∴ Grace period for unpaid premiums is 31 days; policy reinstatement is only possible within 3 years of the last unpaid due date." },
  SFR: { name: "Guaranteed Yearly Coupons — AIA Smart Flexi Rewards (II)", body: "AIA Smart Flexi Rewards (II) is a participating endowment plan designed to provide Guaranteed Yearly Coupons alongside a capital guarantee at maturity. You may pay premiums over 5 years or 10 years, with a policy term of 15 to 30 years for 5-pay, or 20 to 30 years for 10-pay. It also provides coverage against death, and is a participating life insurance policy, allowing you to share in the performance of the participating fund through non-guaranteed bonuses.\n\n• Coupon Benefit — We will pay a Guaranteed Yearly Coupon starting from the 2nd policy anniversary (5-pay, 15% of the Insured Amount) or the 4th policy anniversary (10-pay, 30% of the Insured Amount), payable each year until the policy anniversary one year before maturity. You may choose to receive each coupon or leave it with us to accumulate interest at the prevailing rate.\n• Maturity Benefit — Upon maturity, we will pay the Guaranteed Maturity Amount — a percentage of the Insured Amount set by your chosen Policy Term (for example, 330% for a 15-year 5-pay term, or 570% for a 20-year 10-pay term, scaling down as the term lengthens) — plus any bonuses not surrendered, plus any coupons left to accumulate with us. Your policy will automatically terminate on the maturity date.\n• Death Benefit — In the event of death of the Insured, we will pay the higher of 101% of total premiums paid (without interest, net of coupons already paid) or the guaranteed cash value, plus any bonuses not surrendered, plus any coupons left to accumulate with us. Your policy will automatically terminate on the death of the Insured.\n• Surrender Value — You may surrender your policy for its cash value. Your policy will automatically terminate once it is surrendered in full.\n• Bonuses — You can receive bonuses in the form of Reversionary Bonus (RB) and Terminal Bonus (TB). RB is credited annually from the end of the 1st policy year — projected at $17.50 per $1,000 Insured Amount (5-pay, compounding at 1.75%) or $25 per $1,000 Insured Amount (10-pay, compounding at 2.50%). TB is a non-guaranteed bonus payable upon death, surrender or maturity.\n\nPlan Limitations:\n∴ Early surrender may return a value that is zero or less than total premiums paid.\n∴ Premium Payment Term and Policy Term can only be changed within the first policy year; no changes are allowed after.\n∴ Increase in Insured Amount is only allowed in the 1st policy year; reduction is allowed anytime with a pro-rated refund of cash value.\n∴ Grace period for unpaid premiums is 31 days; reinstatement is possible within 3 years of lapse." },
  SFG: {"name": "Fixed-Term Savings with Guaranteed Maturity — AIA Smart Flexi Growth (5-pay)", "body": "AIA Smart Flexi Growth (5-pay) is a participating endowment plan with a fixed premium payment term of 5 years and a policy term you choose from 15 to 30 years. It works like a fixed deposit with a maturity date — you commit premiums for 5 years only, leave the money to compound, and collect a Guaranteed Maturity Amount at the end. There are no yearly coupons and no partial withdrawal facility, so the plan is meant to be left untouched until it matures. It also provides coverage against death, and is a participating life insurance policy, which allows the policyholder to participate in the performance of the participating fund in the form of bonuses that are not guaranteed.\n\n• Maturity Benefit — Upon maturity, we will pay the Guaranteed Maturity Amount, being a percentage of the Insured Amount set by your chosen Policy Term (525% at 15 years, rising to 575% at 30 years — see the table below), plus any bonuses added to your policy which you have not surrendered, after deducting any amounts owing to us. Your policy will automatically terminate on the maturity date.\n• Death Benefit — In the event of death of the Insured, we will pay the higher of 101% of total premiums paid and/or waived (without interest, including any premium adjustment for payment mode) or the guaranteed cash value, plus any bonuses not surrendered, after deducting any amounts owing to us. Your policy will automatically terminate upon the death of the Insured.\n• Surrender Value — You may surrender your policy for its cash value, subject to deduction of any amounts owing to us. Only a full surrender is available on this plan, and the policy terminates once surrendered.\n• Bonuses — You can receive bonuses in the form of Reversionary Bonus (RB) and Terminal Bonus (TB). At a Projected Investment Rate of Return of 4.25% p.a., RB is illustrated at $45 per $1,000 Insured Amount for all policy years, compounding at 4.50%. Once declared and credited, RB is guaranteed and is not affected by later revisions. TB is a non-guaranteed bonus that may be payable upon death, surrender or maturity.\n• Note on Insured Amount — The Insured Amount is equal to the Annual Premium before any large case size discount. It is not the death benefit; it is the figure used to work out the Guaranteed Maturity Amount and the bonuses.\n\nPlan Limitations:\n∴ No partial withdrawal option — the only way to access value before maturity is a full surrender, which ends the policy entirely.\n∴ Early surrender may return a value that is zero or less than total premiums paid, as an early termination usually involves high costs.\n∴ Only the Guaranteed Maturity Amount is guaranteed. Reversionary and Terminal Bonuses are not, and may be reduced significantly in times of substantial decline in investment returns.\n∴ The death benefit is limited to 101% of premiums paid (or the guaranteed cash value if higher), so this is a savings vehicle rather than a protection plan.\n∴ If the Insured commits suicide within one year of the policy issue date or reinstatement, our liability is limited to a return of premiums paid without interest.\n∴ Grace period for unpaid premiums is 31 days, after which an automatic policy loan may be granted if there is sufficient cash value; otherwise the policy terminates. Reinstatement is possible within 3 years of the last premium due date.", "tables": [{"caption": "Guaranteed Maturity Amount based on Policy Term", "head": ["Policy Term (Years)", "Guaranteed Maturity Amount (of Insured Amount)", "Policy Term (Years)", "Guaranteed Maturity Amount (of Insured Amount)"], "align": ["center", "center", "center", "center"], "dense": true, "rows": [["15", "525%", "23", "545%"], ["16", "528%", "24", "548%"], ["17", "530%", "25", "550%"], ["18", "533%", "26", "555%"], ["19", "535%", "27", "560%"], ["20", "538%", "28", "565%"], ["21", "540%", "29", "570%"], ["22", "543%", "30", "575%"]]}], "tablesNote": "The Guaranteed Maturity Amount is a percentage of the Insured Amount, which equals the Annual Premium before any large case size discount. Bonuses shown in the Benefit Illustration are on top of this and are not guaranteed."} ,
};

// Templates the advisor picks from when adding a plan to a person's quotation table.
// Each entry is a starting point — every field stays editable on the instance afterwards.
// `covers` seeds the coverage breakdown; amounts are the figures previously baked into
// the old free-text `coverage` string.
const PRODUCT_CATALOGUE = [
  { key: "GPP", label: "Whole Life Critical Illness Coverage + 2x coverage before Age 65", category: "Risk Management", monthly: 386.81, annual: 4446, returns: "Cash value: Age 65 $57,324 · Age 70 $76,484 · Age 83 $120,845", tier: "optional",
    covers: [["Death", "90000"], ["Health (Major Critical Illness)", "90000"]], endAge: "100", stepsDown: true, boostedAmount: "180000" },
  { key: "PA", label: "Comprehensive Accident Coverage", category: "Risk Management", monthly: 24.57, annual: 282.51, returns: "No returns", tier: "recommended",
    covers: [["Death (Accident)", "100000"], ["Disability (Accident)", "100000"]] },
  { key: "MSCC", label: "Comprehensive Cancer Coverage", category: "Risk Management", monthly: 63.34, annual: 728, returns: "No returns", tier: "recommended",
    covers: [["Health (Early-Major Critical Illness)", "100000"]] },
  { key: "ASCC", label: "Absolute Critical Cover", category: "Risk Management", monthly: 0, annual: 0, returns: "No returns", tier: "recommended", cciOption: "65",
    covers: [["Health (Major Critical Illness)", "100000"]] },
  { key: "HI", label: "Daily Hospitalisation Income Pay-out", category: "Risk Management", monthly: 25.6, annual: 294, returns: "No returns", tier: "recommended",
    covers: [["Hospitalisation (Accident)", "100"]] },
  { key: "SA", label: "Comprehensive Accident & Specific Diseases Coverage", category: "Risk Management", monthly: 20.43, annual: 234.75, returns: "No returns", tier: "recommended",
    covers: [["Death (Accident)", "35000"], ["Disability (Accident)", "35000"], ["Hospitalisation (Accident)", "50"]] },
  { key: "CPA", label: "Comprehensive Accident & Dementia Coverage", category: "Risk Management", monthly: 33.67, annual: 387, returns: "No returns", tier: "recommended",
    covers: [["Death (Accident)", "60000"], ["Disability (Accident)", "60000"], ["Hospitalisation (Accident)", "100"]] },
  { key: "STP", label: "Income Protection: Death, Disability + Critical Illness", category: "Risk Management", monthly: 106.79, annual: 1227.5, returns: "No returns", tier: "optional",
    covers: [["Death", "500000"], ["Disability", "500000"], ["Health (Major Critical Illness)", "120000"]] },
  { key: "ILP", label: "Investment with Unit Trusts — Growth Fund", category: "Goal Planning", monthly: 250, annual: 3000, returns: "Projection at 4–8%: Age 50 $35,300–45,700 · Age 60 $74,400–122,500 · Age 68 $113,500–228,100", tier: "future",
    covers: [["Others", "15000"]] },
  { key: "RS", label: "Guaranteed Annuity for Retirement", category: "Retirement Planning", monthly: 327.99, annual: 3770, returns: "Capital $82,940 · Income $90,000 · Dividends $48,715 · Terminal $56,055", tier: "future",
    covers: [["Retirement", "500"]], retirementAge: "60", monthlyIncome: "500" },
  { key: "SWB", label: "Wealth Accumulation Endowment", category: "Goal Planning", monthly: 0, annual: 0, returns: "Participating plan — Reversionary and Terminal Bonuses are not guaranteed. Projected at 4.25% p.a. investment return.", tier: "future",
    covers: [["Others", "50000"]] },
  { key: "SFR", label: "Guaranteed Yearly Coupons", category: "Goal Planning", monthly: 0, annual: 0, returns: "Guaranteed yearly coupons plus non-guaranteed Reversionary and Terminal Bonuses.", tier: "future",
    covers: [["Others", "50000"]] },
  { key: "SFG", label: "Fixed-Term Savings with Guaranteed Maturity", category: "Goal Planning", monthly: 0, annual: 0, returns: "Guaranteed Maturity Amount of 525%–575% of the Insured Amount depending on policy term, plus non-guaranteed Reversionary and Terminal Bonuses.", tier: "future",
    covers: [["Others", "50000"]] },
];
// ASCC's coverage option doubles as its coverage end age
const ASCC_OPTIONS = [["65", "Value Plan (to Age 65)"], ["75", "Value Plan (to Age 75)"], ["100", "Life Plan (to Age 100)"]];
const RETIREMENT_AGES = ["55", "60", "65"];
const newProduct = (key, insuredBy = "self") => {
  const t = PRODUCT_CATALOGUE.find(p => p.key === key) || PRODUCT_CATALOGUE[0];
  const { covers, ...rest } = t;
  return {
    ...rest, id: uid(), insuredBy, include: true, planImages: [],
    coverages: (covers || []).map(([category, amount]) => ({ id: uid(), category, amount })),
    startAge: "", endAge: t.endAge || "", premiumEndsAge: "",
  };
};
// how a plan's coverage reads in report tables and timeline tooltips
const isWaiver = (cat) => String(cat || "").startsWith("Premium Waiver");
const planCoverageRows = (p) => {
  // a premium waiver has no insured amount of its own, so it is kept on its category alone
  const rows = (p.coverages || []).filter(c => c.category && (num(c.amount) > 0 || isWaiver(c.category)));
  if (p.key === "RS" && num(p.monthlyIncome) > 0) {
    return [{ id: "rs", category: "Retirement income", amount: p.monthlyIncome, display: money(num(p.monthlyIncome)) + "/month" + (p.retirementAge ? " from age " + p.retirementAge : "") }];
  }
  return rows.map(c => ({ ...c,
    category: String(c.label || "").trim() || c.category,
    display: isWaiver(c.category) && !(num(c.amount) > 0)
      ? "Premiums waived on claim"
      : withUnit(c.category, money(num(c.amount))) }));
};
const planCoverageText = (p) => {
  const rows = planCoverageRows(p);
  if (!rows.length) return p.coverage || "";
  return rows.map(c => c.category + ": " + c.display).join(" · ");
};
// The same product can be quoted for several people, but its explanation page only needs
// to appear once — collapse to one entry per product, gathering every instance's images.
const uniqueExplanations = (selected) => {
  const byKey = new Map();
  (selected || []).forEach(p => {
    const on = Object.entries((p.rating || {}).riders || {}).filter(([, v]) => v).map(([k]) => k);
    const seen = byKey.get(p.key);
    if (seen) {
      seen.planImages = [...seen.planImages, ...(p.planImages || [])];
      on.forEach(k => { seen.riders[k] = true; });
    } else {
      byKey.set(p.key, { key: p.key, label: p.label, planImages: [...(p.planImages || [])],
        riders: Object.fromEntries(on.map(k => [k, true])) });
    }
  });
  return [...byKey.values()];
};
// the small print under a plan's name: how long it covers, and how long premiums run
const planTermText = (p) => {
  const bits = [];
  const start = num(p.startAge), end = num(p.endAge) || num(p.cciOption);
  if (start > 0 && end > 0) bits.push("Cover age " + start + "–" + end);
  else if (end > 0) bits.push("Cover to age " + end);
  if (num(p.premiumEndsAge) > 0) bits.push("premiums to age " + num(p.premiumEndsAge));
  if (p.stepsDown && num(p.boostedAmount) > 0) bits.push("boosted to " + money(num(p.boostedAmount)) + " before 65");
  return bits.join(" · ");
};

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
  EXPENSE_GROUPS.map(g => [g.id, g.items.map(([k, label]) => ({ id: uid(), key: k, label, amount: "", note: "" }))])
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
  // recommended plans are added per insured person — starts empty, built up in step 6
  products: [],
  budgetNote: "approximately $100 per month",
  // "recommendation" = a costed proposal (tiers, subtotals, budget guideline);
  // "options" = a menu of plans to browse, with per-plan premiums but no totals
  reportMode: "recommendation",
  // per-step "last updated" for the two steps whose data goes stale on its own
  // (Income Allocation and Assets & Liabilities) — see SECTION_FIELDS
  sectionUpdated: {},
  // dated snapshots of the headline figures, one per review — see snapshotFrom()
  history: [],
  narrative: { exec: "", recoIntro: "", actionPlan: "" },
  // Annual Review report — separate narrative from the first-time client report above
  // meetingNotes is the advisor's raw notes from the review meeting — kept on the record
  // so a draft can be regenerated later without retyping them
  review: { exec: "", keyPoints: "", financialHealthDone: false, contingencyNote: "", whatsNext: "", meetingNotes: "" },
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
  // Plan types were reworked so each one maps onto an Income Allocation row. SPK is a
  // savings vehicle rather than an insurance plan, so those rows move to the portfolio;
  // the generic "Insurance Plan" has no clear successor and is left for the advisor to re-pick.
  const PLAN_TYPE_RENAMES = {
    "Whole Life": "Whole Life / Critical Illness",
    "Solitaire PA": "Accident & Hospitalisation",
    "Insurance Plan": "",
  };
  const spkPlans = m.existingPlans.filter(p => p.planType === "SPK");
  if (spkPlans.length) {
    m.existingPlans = m.existingPlans.filter(p => p.planType !== "SPK");
    m.existingInvestments = [
      ...m.existingInvestments,
      ...spkPlans.map(p => ({
        id: p.id || uid(), type: "SPK", description: p.planName || "SPK",
        insured: p.insured || "self", owner: "self",
        policyDate: p.policyDate || "", policyExpiry: p.policyExpiry || "", startAge: p.fromAge || "",
        allocation: p.allocation || p.monthly || "", allocationFreq: p.allocationFreq || "monthly",
        notes: p.notes || "",
      })),
    ];
  }
  m.existingPlans = m.existingPlans.map(p =>
    PLAN_TYPE_RENAMES[p.planType] !== undefined ? { ...p, planType: PLAN_TYPE_RENAMES[p.planType] } : p);
  // Single Category + Coverage $ became a repeatable coverage breakdown (a plan can now
  // carry coverage in several granular categories at once)
  const OLD_CATEGORY_TO_COVERAGES = {
    "Death, Disability & Critical Illness": ["Death", "Disability", "Health (Major Critical Illness)"],
    "Death & Disability": ["Death", "Disability"],
    "Critical Illness": ["Health (Major Critical Illness)"],
    "Personal Accident": ["Death (Accident)", "Disability (Accident)"],
    "Hospital Stay": ["Hospitalisation (Accident)"],
    "Retirement": ["Retirement"], "Child Savings": ["Child Savings"], "Others": ["Others"],
  };
  m.existingPlans = m.existingPlans.map(p => {
    if (Array.isArray(p.coverages)) return p;
    const cats = OLD_CATEGORY_TO_COVERAGES[p.category] || (p.category ? ["Others"] : []);
    return { ...p, coverages: cats.map(cat => ({ id: uid(), category: cat, amount: p.coverage || "" })) };
  });
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
  // Recommended plans used to be a fixed catalogue of every product with an include flag;
  // they are now per-insured instances the advisor adds. Keep only what was actually ticked
  // (the untouched catalogue rows carried no client-specific information), give each an id,
  // and convert the old free-text `coverage` string into a structured coverage breakdown.
  m.products = (Array.isArray(c.products) ? c.products : [])
    .filter(p => p && p.include)
    .map(p => {
      const { covers, ...tpl } = PRODUCT_CATALOGUE.find(t => t.key === p.key) || {};
      let coverages = Array.isArray(p.coverages) ? p.coverages : null;
      if (!coverages) {
        // seed from the template's categories, using the old headline figure where we can
        // parse one out of strings like "$90,000 ($180,000)" or "$500,000 / $120,000 CI"
        const headline = String(p.coverage || "").replace(/[,$]/g, "").match(/\d+(\.\d+)?/);
        coverages = (covers || []).map(([category, amount]) => ({
          id: uid(), category, amount: headline ? headline[0] : amount,
        }));
      }
      return {
        ...tpl, ...p,
        id: p.id || uid(),
        insuredBy: p.insuredBy || "self",
        planImages: p.planImages || [],
        coverages,
        startAge: p.startAge ?? "", endAge: p.endAge ?? (tpl.endAge || ""), premiumEndsAge: p.premiumEndsAge ?? "",
        label: p.label || tpl.label || "",
      };
    });
  // Two coverage categories were renamed: any policy covering early stages also covers
  // major stages, and the old "minor" tier is really hospitalisation & surgery cover.
  // Applies to both in-force plans and quoted plans.
  const COVERAGE_RENAMES = {
    "Health (Early-Intermediate Stage)": "Health (Early-Major Critical Illness)",
    "Health (Minor)": "Health (Hospitalisation & Surgery)",
  };
  const renameCoverages = (list) => (list || []).map(p => Array.isArray(p.coverages)
    ? { ...p, coverages: p.coverages.map(cv => COVERAGE_RENAMES[cv.category] ? { ...cv, category: COVERAGE_RENAMES[cv.category] } : cv) }
    : p);
  m.existingPlans = renameCoverages(m.existingPlans);
  m.products = renameCoverages(m.products);
  const oldExp = c.expenses || {};
  if (!EXPENSE_GROUPS.every(g => Array.isArray(oldExp[g.id]))) {
    m.expenses = Object.fromEntries(EXPENSE_GROUPS.map(g => [g.id, g.items.map(([k, label]) => ({ id: uid(), key: k, label, amount: oldExp[k] != null ? String(oldExp[k]) : "", note: "" }))]));
  }
  // Expense rows gained a stable key so plan premiums know which row to feed; match the
  // default rows back up by their (still editable) label.
  EXPENSE_GROUPS.forEach(g => {
    const rows = m.expenses[g.id];
    if (!Array.isArray(rows)) return;
    m.expenses[g.id] = rows.map(r => {
      if (r.key) return r;
      const hit = g.items.find(([, label]) => label === r.label);
      return hit ? { ...r, key: hit[0] } : r;
    });
  });
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

// ---------- plan image storage ----------
// Uploaded diagrams/illustrations for a recommended plan used to be embedded as base64
// inside the client's JSON record, so editing any field re-wrote every image byte along
// with it. They now live in the "plan-images" storage bucket instead — the client record
// only keeps a {id, name, path, caption} pointer, and images are fetched on demand via a
// short-lived signed URL (the bucket is private, scoped per advisor by folder).
const PLAN_IMAGES_BUCKET = "plan-images";
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  // keep the real DOMException — its name is the only clue to why the read failed
  r.onerror = () => reject(r.error || new Error("FileReader failed"));
  r.readAsDataURL(blob);
});
// Turn a read failure into something the advisor can act on. The usual cause on a Mac is
// a cloud placeholder: OneDrive and iCloud hand the browser a File whose bytes are still
// in the cloud, and reading it throws NotReadableError/NotFoundError.
const describeReadError = (e) => {
  const name = e?.name || "";
  if (name === "NotReadableError" || name === "NotFoundError")
    return "the file could not be read from disk. If it lives in OneDrive or iCloud Drive it may not be downloaded to this Mac yet — open it once in Preview so it downloads, or copy it to the Desktop first, then try again.";
  if (name === "SecurityError") return "the browser blocked reading this file. Try copying it to the Desktop and uploading from there.";
  return e?.message || String(e);
};
async function fileToDataUrl(file) {
  if (!file.size) throw new Error("the file is empty (0 bytes) — it may still be downloading from the cloud.");
  try {
    // arrayBuffer() reports the underlying OS error more faithfully than FileReader does
    const buf = await file.arrayBuffer();
    return await blobToDataUrl(new Blob([buf], { type: file.type || "application/octet-stream" }));
  } catch (e) {
    throw new Error(describeReadError(e));
  }
}
// Returns { path } when the image lands in Storage, or { dataUrl } when it had to be
// embedded instead. Storage is preferred — an embedded image is re-sent on every save of
// that client — but a missing bucket or an offline moment shouldn't block the advisor, so
// we fall back rather than fail. PlanImage renders either shape.
async function uploadPlanImage(file, clientId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("not signed in");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${clientId}/${uid()}-${safeName}`;
    const { error } = await supabase.storage.from(PLAN_IMAGES_BUCKET).upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;
    return { path };
  } catch (e) {
    const reason = e?.message || String(e);
    console.warn("[plan images] storage upload failed, embedding instead:", reason, e);
    try {
      return { dataUrl: await fileToDataUrl(file), embedded: true, reason };
    } catch (readErr) {
      // both routes failed — name both, since the storage one is usually the fixable half
      throw new Error(readErr.message + " (the storage upload also failed: " + reason + ")");
    }
  }
}
async function deletePlanImage(path) {
  if (!path) return;
  try { await supabase.storage.from(PLAN_IMAGES_BUCKET).remove([path]); }
  catch (e) { console.error("plan image delete failed", e); } // best-effort — never block removing it from the plan
}
async function signedPlanImageUrl(path) {
  const { data, error } = await supabase.storage.from(PLAN_IMAGES_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ---------- derived figures ----------
// future value of a current amount + fixed monthly contribution, at r% p.a. over n years
function projectFV(o, fallbackYears) {
  const cur = num(o.current), annContrib = num(o.contrib) * 12, r = num(o.rate) / 100;
  const n = num(o.years) || num(fallbackYears) || 0;
  const growth = Math.pow(1 + r, n);
  return cur * growth + (r > 0 ? annContrib * ((growth - 1) / r) : annContrib * n);
}

// Total monthly premium each Income Allocation row picks up from the plans on file.
// Plan type decides the row (see EXISTING_PLAN_TYPES), and every frequency is normalised
// to a monthly figure so quarterly/annual premiums compare like for like.
function planPremiumsByExpenseKey(c) {
  const out = {};
  (c.existingPlans || []).forEach(p => {
    const meta = planTypeMeta(p.planType);
    // lapsed/surrendered policies are gone, and APL/ETI premiums aren't paid out of pocket
    if (!meta || !statusPaysPremium(p.status)) return;
    const monthly = freqMonthlyEquiv(p.allocation ?? p.monthly, p.allocationFreq);
    if (monthly > 0) out[meta.expenseKey] = (out[meta.expenseKey] || 0) + monthly;
  });
  return out;
}
// A typed figure always wins; a blank row falls back to what the plans imply.
function expenseRowAmount(row, planPremiums) {
  const typed = String(row.amount ?? "").trim();
  if (typed !== "") return num(typed);
  return row.key ? (planPremiums[row.key] || 0) : 0;
}

function compute(c) {
  const allowTotal = (c.income.allowances || []).reduce((s, a) => s + num(a.amount), 0);
  const othersTotal = (c.income.others || []).reduce((s, a) => s + num(a.amount), 0);
  const bonusMonthly = num(c.income.bonuses) / 12;
  const gross = num(c.income.basic) + allowTotal + othersTotal + bonusMonthly;
  const spk = num(c.income.basic) * num(c.income.spkPct) / 100;
  const net = gross - spk;
  // premiums already committed by the plans on file, keyed by the Income Allocation row
  // they belong to — these fill in any row the advisor hasn't typed a figure into
  const planPremiums = planPremiumsByExpenseKey(c);
  const groupTotals = {};
  let totalExpenses = 0;
  EXPENSE_GROUPS.forEach(g => {
    const t = (c.expenses[g.id] || []).reduce((s, row) => s + expenseRowAmount(row, planPremiums), 0);
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
  // both figures fall back to the SPK holding under Current Coverage when left blank here
  const spkMonthly = spkAnnuityMonthlyOf(c);
  const spkAnnuityTotal = spkMonthly > 0 ? spkMonthly * 12 * num(rt.spkAnnuityYears) : num(rt.spkAnnuityLegacy);
  const annTotal = projectFV(rt.annuities || {}, yearsToRet);
  const invTotal = projectFV(rt.investments || {}, yearsToRet);
  const rtProjected = spkProjected(c) + spkAnnuityTotal + num(rt.pension) + annTotal + invTotal;
  const rtShortfall = Math.max(0, rtAdjusted - rtProjected);
  const rtMonthlyAnnuity = num(rt.years) > 0 ? rtProjected / (num(rt.years) * 12) : 0;
  // products
  const selected = (c.products || []).filter(p => p.include);
  // one quotation table per insured person — client first, then each dependent that
  // actually has a plan quoted for them
  const insuredGroups = [
    { id: "self", name: c.name || "Client", relationship: "" },
    ...(c.dependents || []).map(dep => ({ id: dep.id, name: dep.name || "Dependent", relationship: dep.relationship || "" })),
  ].map(person => {
    const items = selected
      .filter(p => (p.insuredBy || "self") === person.id)
      // pre-rendered strings so the DOCX exporter doesn't need the display helpers
      .map(p => ({ ...p, coverageText: planCoverageText(p), termText: planTermText(p) }));
    return { ...person, items, monthly: items.reduce((s, p) => s + num(p.monthly), 0), annual: items.reduce((s, p) => s + num(p.annual), 0) };
  }).filter(g => g.items.length);
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
    potentialIncome, irRows, irMonthly, irYears, age, retAge, yearsToRet, rtRequired, rtAdjusted, rtProjected, rtShortfall, rtMonthlyAnnuity, spkAnnuityTotal, spkMonthly, spkLumpSum: spkProjected(c), annTotal, invTotal, selected, insuredGroups, premMonthly, premAnnual, planPremiums };
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
    ...d.selected.map(p => `  • ${p.label} — coverage: ${planCoverageText(p)}, monthly premium: ${money(p.monthly, 0)}`),
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

// The annual review is a different document from the first-time recommendation: it recaps a
// conversation that has already happened rather than making a case from scratch. So the
// advisor's own meeting notes lead, and the client data is there for grounding — to catch a
// figure the notes reference loosely, and to keep the draft honest about what is on file.
function buildReviewPrompt(c, d, notes) {
  const activePlans = (c.existingPlans || []).filter(p => statusPaysPremium(p.status));
  const split = currentPremiumSplit(c);
  const annualIncome = d.net * 12;
  const failing = d.ratios.filter(r => r.pass === false).map(r => r.name);
  const gaps = d.irRows.filter(r => r.shortfall > 0).map(r => `${r.name} (short ${money(r.shortfall, 0)})`);
  const lines = [
    `You are drafting the narrative sections of an ANNUAL REVIEW report for an existing client of a Certified Financial Planner in Brunei working under GoodLife Financial Planning (in association with AIA Brunei), with an advisory approach built on stewardship, trust, and reducing financial anxiety. Tone: warm, professional, plain-spoken, client-centred, never salesy or alarmist. Address the client as "you". Amounts are in BND ($).`,
    ``,
    `This is a review of a relationship already in place — not a first proposal. Write as a recap of the meeting that just happened: what has changed since last time, what you discussed, and what happens next. Do not re-introduce the client to financial planning or restate their whole situation from first principles.`,
    ``,
    `THE ADVISOR'S NOTES FROM THIS REVIEW MEETING (this is your primary source — everything below it is background):`,
    notes.trim(),
    ``,
    `CLIENT DATA ON FILE (for grounding figures; do not recite what the notes do not raise):`,
    `- Name: ${c.name || "Client"}`,
    `- Age: ${calcAge(c.dob) || "Not provided"}`,
    `- Occupation: ${c.occupation || "Not provided"}`,
    `- Meeting date: ${c.meetingDate || "Not provided"}`,
    `- Dependents: ${(c.dependents || []).filter(dep => dep.name).map(dep => `${dep.name} (${dep.relationship || "dependent"}${dep.dob ? ", age " + calcAge(dep.dob) : ""})`).join("; ") || "None on file"}`,
    `- Monthly net income: ${money(d.net, 0)} (${money(annualIncome, 0)} / year)`,
    `- Monthly expenses: ${money(d.totalExpenses, 0)} · surplus ${money(d.surplus, 0)}`,
    `- Cash & equivalents: ${money(d.cash, 0)} against a 3-month emergency fund target of ${money(d.ef3, 0)}`,
    `- Net worth: ${money(d.netWorth, 0)} · liabilities ${money(d.totalLiab, 0)}`,
    `- Ratios below benchmark: ${failing.length ? failing.join(", ") : "None"}`,
    `- Protection shortfalls still open: ${gaps.length ? gaps.join("; ") : "None"}`,
    `- Policies in force (premium being paid): ${activePlans.length ? activePlans.map(pl => `${pl.planName || pl.planType || "plan"}${pl.planType && pl.planName ? " (" + pl.planType + ")" : ""}`).join("; ") : "None on file"}`,
    `- Policies not being paid: ${(c.existingPlans || []).filter(pl => !statusPaysPremium(pl.status)).map(pl => `${pl.planName || pl.planType || "plan"} — ${statusLabel(pl.status)}`).join("; ") || "None"}`,
    `- Premium commitment: protection ${money(split.protection * 12, 0)}/yr, savings & investments ${money(split.savings * 12, 0)}/yr` +
      (annualIncome > 0 ? ` — against 4-3-2-1 guidelines of ${money(annualIncome * 0.1, 0)} (10%) and ${money(annualIncome * 0.2, 0)} (20%)` : ``),
    `- Plans proposed at this review: ${d.selected.length ? d.selected.map(pl => `${pl.label} (${money(num(pl.monthly), 0)}/mo)`).join("; ") : "None"}`,
    `- Financial health check completed this meeting: ${c.review?.financialHealthDone ? "Yes" : "No"}`,
    ``,
    `Write three sections. The JSON keys below are fixed by the system that reads your answer — use them exactly as given, even though two of them are named for a different document:`,
    `1. "exec" — Executive summary (2-3 short paragraphs): recap the meeting. Lead with what has changed since the last review, why it matters, and what you looked at together. Reference the meeting date if given. Do not list the plans; that belongs elsewhere in the report.`,
    `2. "recoIntro" — put THE KEY POINTS DISCUSSED here. One per line, each formatted exactly "Title — detail" with an em dash. 3-6 lines. The title is 2-4 words naming the point (e.g. "Growing Family", "Protection Gap", "Emergency Fund"); the detail is one or two sentences. No numbering, no bullet characters, no blank lines between them.`,
    `3. "actionPlan" — put WHAT HAPPENS NEXT here. A numbered list of agreed next steps, 2-5 items, as a single string with each item on its own line starting "1. ", "2. " etc., formatted "1. Title: detail". Only include steps the notes actually support — do not invent commitments.`,
    ``,
    `If the notes mention a specific figure that conflicts with the data on file, follow the notes and do not correct them silently.`,
    `Write product names exactly as the notes or the data give them. Never expand an abbreviation into a full product name and never invent one — if the notes say "MSCC", write "MSCC".`,
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

// standard (reducing-balance) amortization: monthly repayment, remaining balance after k months paid
const amortize = (principal, annualRatePct, termYears, monthsPaid) => {
  const P = num(principal), r = num(annualRatePct) / 100 / 12, n = Math.round(num(termYears) * 12);
  const k = Math.min(Math.max(Math.round(num(monthsPaid)), 0), n);
  if (P <= 0 || n <= 0) return { monthly: 0, totalInterest: 0, total: 0, monthsRemaining: 0, remainingBalance: 0 };
  const monthly = r > 0 ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
  const total = monthly * n;
  const totalInterest = total - P;
  const remainingBalance = r > 0
    ? P * Math.pow(1 + r, k) - monthly * ((Math.pow(1 + r, k) - 1) / r)
    : P - monthly * k;
  return { monthly, totalInterest, total, monthsRemaining: n - k, remainingBalance: Math.max(0, remainingBalance) };
};

// flat/simple-interest loan (car loans): interest = principal x rate x term, spread evenly over the term
const simpleLoan = (principal, annualRatePct, termYears, monthsPaid) => {
  const P = num(principal), rate = num(annualRatePct) / 100, term = num(termYears), n = Math.round(term * 12);
  const k = Math.min(Math.max(Math.round(num(monthsPaid)), 0), n);
  if (P <= 0 || n <= 0) return { monthly: 0, totalInterest: 0, total: 0, monthsRemaining: 0, remainingBalance: 0 };
  const totalInterest = P * rate * term;
  const total = P + totalInterest;
  const monthly = total / n;
  return { monthly, totalInterest, total, monthsRemaining: n - k, remainingBalance: Math.max(0, total - monthly * k) };
};

// HP Plus / AITAB Flexi split car loan: capital is fixed-split 70/30 across two tranches with
// independent rates/terms. Tranche A's interest is levied on the FULL car price (the standard
// HP-Plus mechanic — capital repayment only covers 70%, the rest balloons into tranche B); tranche
// B's interest is levied only on its own 30% balloon capital.
const CAR_SPLIT_PCT_A = 0.7;
const carSplitLoan = (carPrice, rateA, termYearsA, monthsPaidA, rateB, termYearsB, monthsPaidB) => {
  const P = num(carPrice);
  const capitalA = P * CAR_SPLIT_PCT_A, capitalB = P * (1 - CAR_SPLIT_PCT_A);
  const nA = Math.round(num(termYearsA) * 12), nB = Math.round(num(termYearsB) * 12);
  const kA = Math.min(Math.max(Math.round(num(monthsPaidA)), 0), nA);
  const kB = Math.min(Math.max(Math.round(num(monthsPaidB)), 0), nB);
  const totalInterestA = P * (num(rateA) / 100) * num(termYearsA);
  const totalInterestB = capitalB * (num(rateB) / 100) * num(termYearsB);
  const totalA = capitalA + totalInterestA, totalB = capitalB + totalInterestB;
  const monthlyA = nA > 0 ? totalA / nA : 0, monthlyB = nB > 0 ? totalB / nB : 0;
  return {
    capitalA, capitalB,
    a: { totalInterest: totalInterestA, total: totalA, monthly: monthlyA, monthsRemaining: nA - kA, remainingBalance: Math.max(0, totalA - monthlyA * kA) },
    b: { totalInterest: totalInterestB, total: totalB, monthly: monthlyB, monthsRemaining: nB - kB, remainingBalance: Math.max(0, totalB - monthlyB * kB) },
    grandTotal: totalA + totalB,
    combinedRemaining: Math.max(0, totalA - monthlyA * kA) + Math.max(0, totalB - monthlyB * kB),
  };
};

const LOAN_TYPES = [
  { id: "amortized", label: "Amortized (Personal / Housing)" },
  { id: "carSimple", label: "Car Loan (simple interest)" },
  { id: "carSplit", label: "Car Loan — HP Plus / AITAB Flexi (split)" },
];
const loanDefaults = (type) => (
  type === "carSplit"
    ? { type, carPrice: "", rateA: "", termYearsA: "7", monthsPaidA: "0", rateB: "", termYearsB: "3", monthsPaidB: "0" }
    : { type, principal: "", rate: "", termYears: "", monthsPaid: "0" }
);

const BreakdownTable = ({ rows }) => (
  <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
    <thead><tr className="bg-indigo-500 text-white"><th colSpan={rows[0].cols.length + 1} className="text-left py-1.5 px-3 font-semibold">Breakdown</th></tr></thead>
    <tbody>
      {rows.map((row, i) => (
        <tr key={i} className={(row.shade ? "bg-slate-100 " : "") + (row.dashed ? "border-y border-dashed border-orange-300 bg-orange-50 " : "") + (row.boxed ? "ring-2 ring-red-500 ring-inset " : "")}>
          <td className="py-1.5 px-3 font-medium">{row.label}</td>
          {row.cols.map((c, j) => <td key={j} className={"py-1.5 px-3 text-right tabular-nums " + (row.bold ? "font-bold " : "") + (row.dashed && j === row.cols.length - 1 ? "text-orange-600 " : "")}>{c}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
);

const LiabilityRows = ({ rows, onChange }) => {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const rid = r.id || i;
        const hasLoan = !!r.loan;
        const loanType = r.loan?.type || "amortized";
        const isOpen = openId === rid;
        const setRow = (patch) => { const l = [...rows]; l[i] = { ...r, ...patch }; onChange(l); };
        const setLoan = (patch) => {
          const loan = { ...r.loan, ...patch };
          let remaining;
          if (loan.type === "carSplit") remaining = carSplitLoan(loan.carPrice, loan.rateA, loan.termYearsA, loan.monthsPaidA, loan.rateB, loan.termYearsB, loan.monthsPaidB).combinedRemaining;
          else if (loan.type === "carSimple") remaining = simpleLoan(loan.principal, loan.rate, loan.termYears, loan.monthsPaid).remainingBalance;
          else remaining = amortize(loan.principal, loan.rate, loan.termYears, loan.monthsPaid).remainingBalance;
          setRow({ loan, amount: remaining.toFixed(2) });
        };
        let breakdownRows = null;
        if (hasLoan && loanType === "carSplit") {
          const c = carSplitLoan(r.loan.carPrice, r.loan.rateA, r.loan.termYearsA, r.loan.monthsPaidA, r.loan.rateB, r.loan.termYearsB, r.loan.monthsPaidB);
          breakdownRows = [
            { label: "Car Price", cols: [money(num(r.loan.carPrice)), money(c.grandTotal)], dashed: true },
            { label: "Capital Repayment (70%/30%)", cols: [money(c.capitalA), money(c.capitalB)], shade: true },
            { label: "Interest Rate", cols: [fmt(num(r.loan.rateA), 2) + "%", fmt(num(r.loan.rateB), 2) + "%"] },
            { label: "Term", cols: [num(r.loan.termYearsA), num(r.loan.termYearsB)], shade: true },
            { label: "Total Interest", cols: [money(c.a.totalInterest), money(c.b.totalInterest)] },
            { label: "Total", cols: [money(c.a.total), money(c.b.total)], dashed: true, bold: true },
            { label: "Monthly Repayment", cols: [money(c.a.monthly), money(c.b.monthly)], dashed: true, bold: true },
            { label: "Months Paid", cols: [Math.round(num(r.loan.monthsPaidA)), Math.round(num(r.loan.monthsPaidB))], shade: true },
            { label: "Months Remaining", cols: [c.a.monthsRemaining, c.b.monthsRemaining] },
            { label: "Remaining Balance", cols: [money(c.a.remainingBalance), money(c.b.remainingBalance)], shade: true, boxed: true, bold: true },
          ];
        } else if (hasLoan) {
          const calcFn = loanType === "carSimple" ? simpleLoan : amortize;
          const calc = calcFn(r.loan.principal, r.loan.rate, r.loan.termYears, r.loan.monthsPaid);
          breakdownRows = [
            { label: loanType === "carSimple" ? "Car Price" : "Loan Amount", cols: [money(num(r.loan.principal))], shade: true },
            { label: "Interest Rate", cols: [fmt(num(r.loan.rate), 2) + "%"] },
            { label: "Term", cols: [num(r.loan.termYears)], shade: true },
            { label: "Total Interest", cols: [money(calc.totalInterest)] },
            { label: "Total", cols: [money(calc.total)], dashed: true, bold: true },
            { label: "Monthly Repayment", cols: [money(calc.monthly)], dashed: true, bold: true },
            { label: "Months Paid", cols: [Math.round(num(r.loan.monthsPaid))], shade: true },
            { label: "Months Remaining", cols: [calc.monthsRemaining] },
            { label: "Remaining Balance", cols: [money(calc.remainingBalance)], shade: true, boxed: true, bold: true },
          ];
        }
        return (
          <div key={rid} className="rounded-lg border border-slate-200 p-2">
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-6"><Input value={r.name} onChange={e => setRow({ name: e.target.value })} placeholder="e.g. Personal loan" /></div>
              <div className="col-span-4">
                <NumInput value={r.amount} disabled={hasLoan} onChange={e => setRow({ amount: e.target.value })} placeholder="$" className={hasLoan ? "bg-slate-50 text-slate-500" : ""} />
              </div>
              <div className="col-span-1 flex items-center justify-center">
                <button
                  onClick={() => { if (hasLoan) { setOpenId(isOpen ? null : rid); } else { setOpenId(isOpen ? null : rid); } }}
                  title="Loan calculator" className={"text-sm " + (hasLoan ? "text-purple-700" : "text-slate-400 hover:text-purple-700")}
                >🧮</button>
              </div>
              <div className="col-span-1 flex items-center justify-center">
                <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-red-500 text-sm">✕</button>
              </div>
            </div>
            {!hasLoan && isOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Choose a calculator type</div>
                {LOAN_TYPES.map(lt => (
                  <button key={lt.id} onClick={() => setRow({ loan: { ...loanDefaults(lt.id), ...(lt.id !== "carSplit" ? { principal: r.amount || "" } : {}) } })} className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-slate-200 hover:border-purple-400 hover:bg-purple-50">
                    {lt.label}
                  </button>
                ))}
              </div>
            )}
            {hasLoan && isOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{LOAN_TYPES.find(lt => lt.id === loanType)?.label}</span>
                  <button onClick={() => setRow({ loan: null })} className="text-xs text-red-500 hover:underline">Change / remove calculator</button>
                </div>
                {loanType === "carSplit" ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-1">
                      <Field label="Car price"><NumInput value={r.loan.carPrice} onChange={e => setLoan({ carPrice: e.target.value })} placeholder="$" /></Field>
                      <div />
                      <div />
                      <div />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-1">
                      <Field label="Rate — 7yr tranche (%/yr)"><NumInput value={r.loan.rateA} onChange={e => setLoan({ rateA: e.target.value })} placeholder="3.8" /></Field>
                      <Field label="Term A (years)"><NumInput value={r.loan.termYearsA} onChange={e => setLoan({ termYearsA: e.target.value })} placeholder="7" /></Field>
                      <Field label="Months paid A"><NumInput value={r.loan.monthsPaidA} onChange={e => setLoan({ monthsPaidA: e.target.value })} placeholder="0" /></Field>
                      <div />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                      <Field label="Rate — 3yr tranche (%/yr)"><NumInput value={r.loan.rateB} onChange={e => setLoan({ rateB: e.target.value })} placeholder="4.75" /></Field>
                      <Field label="Term B (years)"><NumInput value={r.loan.termYearsB} onChange={e => setLoan({ termYearsB: e.target.value })} placeholder="3" /></Field>
                      <Field label="Months paid B"><NumInput value={r.loan.monthsPaidB} onChange={e => setLoan({ monthsPaidB: e.target.value })} placeholder="0" /></Field>
                      <div />
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <Field label={loanType === "carSimple" ? "Car price" : "Loan amount"}><NumInput value={r.loan.principal} onChange={e => setLoan({ principal: e.target.value })} placeholder="$" /></Field>
                    <Field label="Interest rate (%/yr)"><NumInput value={r.loan.rate} onChange={e => setLoan({ rate: e.target.value })} placeholder="4.25" /></Field>
                    <Field label="Term (years)"><NumInput value={r.loan.termYears} onChange={e => setLoan({ termYears: e.target.value })} placeholder="25" /></Field>
                    <Field label="Months paid"><NumInput value={r.loan.monthsPaid} onChange={e => setLoan({ monthsPaid: e.target.value })} placeholder="0" /></Field>
                  </div>
                )}
                <BreakdownTable rows={breakdownRows} />
                <p className="text-xs text-slate-400 mt-2">The liability amount above is auto-set to the remaining balance as months paid updates.</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// projected future value of an invested asset: current value compounds at the growth rate, plus
// a regular annual contribution (assumed made at the end of each year) compounding alongside it
const investmentGrowth = (current, contribution, years, ratePct) => {
  const P = num(current), C = num(contribution), n = num(years), r = num(ratePct) / 100;
  if (n <= 0) return { futureValue: P, totalContributions: 0, totalGrowth: 0 };
  const fvCurrent = P * Math.pow(1 + r, n);
  const fvContrib = r > 0 ? C * ((Math.pow(1 + r, n) - 1) / r) : C * n;
  const totalContributions = C * n;
  const futureValue = fvCurrent + fvContrib;
  return { futureValue, totalContributions, totalGrowth: futureValue - P - totalContributions };
};

const InvestedAssetRows = ({ rows, onChange }) => {
  const [openId, setOpenId] = useState(null);
  return (
    <div className="space-y-2">
      {rows.map((a, i) => {
        const rid = a.id || i;
        const hasGrowth = !!a.growth;
        const isOpen = openId === rid;
        const setRow = (patch) => { const l = [...rows]; l[i] = { ...a, ...patch }; onChange(l); };
        const setGrowth = (patch) => {
          const growth = { ...a.growth, ...patch };
          const { futureValue } = investmentGrowth(a.current, growth.contribution, growth.years, growth.rate);
          setRow({ growth, future: futureValue.toFixed(2) });
        };
        const calc = hasGrowth ? investmentGrowth(a.current, a.growth.contribution, a.growth.years, a.growth.rate) : null;
        const breakdownRows = hasGrowth ? [
          { label: "Current Value", cols: [money(num(a.current))], shade: true },
          { label: "Annual Contribution", cols: [money(num(a.growth.contribution))] },
          { label: "Period (Years)", cols: [num(a.growth.years)], shade: true },
          { label: "Annualised Growth", cols: [fmt(num(a.growth.rate), 2) + "%"] },
          { label: "Total Contributions", cols: [money(calc.totalContributions)], shade: true },
          { label: "Total Growth", cols: [money(calc.totalGrowth)] },
          { label: "Projected Future Value", cols: [money(calc.futureValue)], shade: true, boxed: true, bold: true },
        ] : null;
        return (
          <div key={rid} className="rounded-lg border border-slate-200 p-2">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5"><Input value={a.name} onChange={e => setRow({ name: e.target.value })} placeholder="e.g. SPK" /></div>
              <div className="col-span-3"><NumInput value={a.current} onChange={e => setRow({ current: e.target.value })} /></div>
              <div className="col-span-3">
                <NumInput value={a.future} disabled={hasGrowth} onChange={e => setRow({ future: e.target.value })} className={hasGrowth ? "bg-slate-50 text-slate-500" : ""} />
              </div>
              <div className="col-span-1 flex items-center justify-center gap-1">
                <button
                  onClick={() => { if (hasGrowth) { setOpenId(isOpen ? null : rid); } else { setRow({ growth: { contribution: "", years: "", rate: "" } }); setOpenId(rid); } }}
                  title="Future value calculator" className={"text-sm " + (hasGrowth ? "text-purple-700" : "text-slate-400 hover:text-purple-700")}
                >🧮</button>
                <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-red-500 text-sm">✕</button>
              </div>
            </div>
            {hasGrowth && isOpen && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Future value calculator</span>
                  <button onClick={() => setRow({ growth: null })} className="text-xs text-red-500 hover:underline">Remove calculator</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                  <Field label="Annual contribution"><NumInput value={a.growth.contribution} onChange={e => setGrowth({ contribution: e.target.value })} placeholder="$" /></Field>
                  <Field label="Period (years)"><NumInput value={a.growth.years} onChange={e => setGrowth({ years: e.target.value })} placeholder="10" /></Field>
                  <Field label="Annualised growth (%/yr)"><NumInput value={a.growth.rate} onChange={e => setGrowth({ rate: e.target.value })} placeholder="6" /></Field>
                </div>
                <BreakdownTable rows={breakdownRows} />
                <p className="text-xs text-slate-400 mt-2">The future value above is auto-set to the projected value as inputs change.</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// One quoted plan inside a person's plan-quotation table. Mirrors the Current Coverage
// editor (coverage breakdown, coverage term, premium-ends age) so the recommended side of
// the Overview timeline can be built from the same shape as the in-force side.
const RecommendedPlanCard = ({ p, onChange, onRemove, insuredOptions, clientId, onMove, canMoveUp, canMoveDown }) => {
  const setP = (patch) => onChange({ ...p, ...patch });
  // Products with an official rate table can price themselves from the insured's age (plus
  // occupation class / gender / smoking status where the table needs them), so the advisor
  // picks a plan tier and riders rather than typing premiums in by hand.
  const rateMeta = RATED_PRODUCTS[p.key] || null;
  const rating = p.rating || {};
  const insuredAge = insuredOptions.find(o => o.id === (p.insuredBy || "self"))?.age;
  const ratedAge = num(rating.ageOverride) > 0 ? num(rating.ageOverride)
    : (num(insuredAge) > 0 ? num(insuredAge) + (rateMeta?.ageBasis === "next" ? 1 : 0) : 0);
  const quote = rateMeta ? quotePremium(p.key, {
    tier: rating.tier || 1, age: ratedAge, occClass: rating.occClass || "12",
    gender: rating.gender || "male", smoker: !!rating.smoker,
    riders: rating.riders || {}, riderOpts: rating.riderOpts || {},
  }) : null;
  // one write: rating inputs and the premiums they produce move together
  const setRating = (patch) => {
    const next = { ...rating, ...patch,
      riders: { ...(rating.riders || {}), ...(patch.riders || {}) },
      riderOpts: { ...(rating.riderOpts || {}), ...(patch.riderOpts || {}) } };
    const q = rateMeta ? quotePremium(p.key, {
      tier: next.tier || 1,
      age: num(next.ageOverride) > 0 ? num(next.ageOverride)
        : (num(insuredAge) > 0 ? num(insuredAge) + (rateMeta.ageBasis === "next" ? 1 : 0) : 0),
      occClass: next.occClass || "12", gender: next.gender || "male",
      smoker: !!next.smoker, riders: next.riders || {}, riderOpts: next.riderOpts || {},
    }) : null;
    // the tier drives the sum assured too, so rebuild the coverage breakdown alongside it
    const rows = benefitsFor(p.key, next.tier || 1, next.riders || {}, next.riderOpts || {});
    const coverages = rows ? rows.map(r => ({ id: uid(), ...r })) : p.coverages;
    onChange({ ...p, rating: next, coverages, ...(q ? { monthly: q.monthly, annual: q.annual } : {}) });
  };
  const setCov = (j, patch) => { const cs = [...(p.coverages || [])]; cs[j] = { ...cs[j], ...patch }; setP({ coverages: cs }); };
  const covTotal = (p.coverages || []).reduce((s, c) => s + num(c.amount), 0);
  // the headline sum assured is the largest single category, not the sum of them —
  // Death $90k + Critical Illness $90k is $90k of cover, not $180k
  const covPeak = Math.max(0, ...(p.coverages || []).map(c => num(c.amount)));
  return (
    <div className={"rounded-xl border-2 p-4 " + (p.include ? (TIER_META[p.tier]?.cls || "border-slate-200 bg-white") : "border-slate-200 bg-slate-50 opacity-70")}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <label className="flex items-center gap-2 font-semibold text-slate-800">
          <input type="checkbox" checked={p.include} onChange={e => setP({ include: e.target.checked })} className="w-4 h-4 accent-purple-700" title="Untick to keep the plan on file but leave it out of the report" />
          <span className="text-xs bg-slate-200 rounded px-1.5 py-0.5">{p.key}</span> {p.label}
        </label>
        <div className="flex items-center gap-2">
          <select value={p.tier} onChange={e => setP({ tier: e.target.value })} className="text-sm rounded-lg border border-slate-300 px-2 py-1 bg-white">
            <option value="">— no label —</option>
            <option value="recommended">Recommended (in budget)</option>
            <option value="optional">Worth considering (outside budget)</option>
            <option value="future">Future option</option>
          </select>
          <select value={p.insuredBy || "self"} onChange={e => setP({ insuredBy: e.target.value })} title="Move this plan to another person's table" className="text-sm rounded-lg border border-slate-300 px-2 py-1 bg-white">
            {insuredOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <span className="inline-flex flex-col leading-none">
            <button onClick={() => onMove(-1)} disabled={!canMoveUp} title="Move up — plans print in this order"
              className={"text-[10px] px-1 " + (canMoveUp ? "text-slate-500 hover:text-purple-800" : "text-slate-300 cursor-default")}>▲</button>
            <button onClick={() => onMove(1)} disabled={!canMoveDown} title="Move down — plans print in this order"
              className={"text-[10px] px-1 " + (canMoveDown ? "text-slate-500 hover:text-purple-800" : "text-slate-300 cursor-default")}>▼</button>
          </span>
          <button onClick={onRemove} className="text-red-500 text-sm px-1">✕</button>
        </div>
      </div>

      <div className="grid md:grid-cols-12 gap-3">
        <div className="md:col-span-6"><Field label="Plan label (as shown in report)"><Input value={p.label} onChange={e => setP({ label: e.target.value })} /></Field></div>
        {p.key === "ASCC" && (
          <div className="md:col-span-3"><Field label="Coverage option">
            <select value={p.cciOption || "65"} onChange={e => setP({ cciOption: e.target.value, endAge: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {ASCC_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field></div>
        )}
        {p.key === "RS" && (<>
          <div className="md:col-span-3"><Field label="Retirement age">
            <select value={p.retirementAge || "60"} onChange={e => setP({ retirementAge: e.target.value, startAge: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {RETIREMENT_AGES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field></div>
          <div className="md:col-span-3"><Field label="Monthly retirement income" hint="Drives the coverage shown in the report"><NumInput value={p.monthlyIncome} onChange={e => setP({ monthlyIncome: e.target.value })} placeholder="500" /></Field></div>
        </>)}
      </div>

      {!rateMeta && PLAN_RIDERS[p.key] && (
        <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-purple-800 mb-2">Optional benefits</div>
          <div className="flex flex-wrap gap-4">
            {PLAN_RIDERS[p.key].map(r => (
              <label key={r.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!(rating.riders || {})[r.key]}
                  onChange={e => setP({ rating: { ...rating, riders: { ...(rating.riders || {}), [r.key]: e.target.checked } } })}
                  className="w-4 h-4 accent-purple-700" />
                {r.label}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Selecting this adds the benefit's covered-conditions list to the plan explanation in the report.</p>
        </div>
      )}

      {rateMeta && (
        <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-purple-800">Premium from rate table</span>
            <span className="text-[11px] text-slate-500">{rateMeta.source}</span>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <Field label="Plan tier">
              <select value={rating.tier || 1} onChange={e => setRating({ tier: num(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {Array.from({ length: rateMeta.tiers }, (_, k) => <option key={k + 1} value={k + 1}>Plan {k + 1}</option>)}
              </select>
            </Field>
            <Field label="Age used" hint={num(rating.ageOverride) > 0 ? "manual override" : (num(insuredAge) > 0 ? "from the insured's date of birth" : "add a date of birth, or type an age")}>
              <NumInput value={rating.ageOverride ?? ""} onChange={e => setRating({ ageOverride: e.target.value })} placeholder={ratedAge > 0 ? String(ratedAge) : "age"} />
            </Field>
            {rateMeta.needs.includes("occClass") && (
              <Field label="Occupational class">
                <select value={rating.occClass || "12"} onChange={e => setRating({ occClass: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="12">Class 1 & 2</option>
                  <option value="34">Class 3 & 4</option>
                </select>
              </Field>
            )}
            {rateMeta.needs.includes("gender") && (
              <Field label="Gender">
                <select value={rating.gender || "male"} onChange={e => setRating({ gender: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
            )}
            {rateMeta.needs.includes("smoker") && (
              <Field label="Smoking status">
                <select value={rating.smoker ? "1" : "0"} onChange={e => setRating({ smoker: e.target.value === "1" })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="0">Non-smoker</option>
                  <option value="1">Smoker</option>
                </select>
              </Field>
            )}
          </div>
          {rateMeta.riders.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {rateMeta.riders.map(r => (
                <span key={r.key} className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!(rating.riders || {})[r.key]} onChange={e => setRating({ riders: { [r.key]: e.target.checked } })} className="w-4 h-4 accent-purple-700" />
                    {r.label}
                  </label>
                  {r.options && (rating.riders || {})[r.key] && (
                    <select value={(rating.riderOpts || {})[r.key] || rating.tier || 1}
                      onChange={e => setRating({ riderOpts: { [r.key]: num(e.target.value) } })}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs bg-white">
                      {r.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                </span>
              ))}
            </div>
          )}
          {quote ? (
            <div className="mt-2 text-sm">
              <div className="flex flex-wrap gap-x-4 text-xs text-slate-600">
                {quote.lines.map((l, k) => <span key={k}>{l.label}: {money(l.monthly, 2)}/mo</span>)}
              </div>
              <div className="font-semibold text-purple-900 mt-1">
                {rateMeta.currency}{fmt(quote.monthly, 2)} / month · {rateMeta.currency}{fmt(quote.annual, 2)} / year
                <span className="font-normal text-slate-500"> (semi-annual {rateMeta.currency}{fmt(quote.semiannual, 2)})</span>
              </div>
              {quote.notes.map((n, k) => <div key={k} className="text-xs text-amber-700 mt-0.5">{n}</div>)}
            </div>
          ) : (
            <div className="mt-2 text-xs text-amber-700">
              {ratedAge > 0
                ? `No rate for age ${ratedAge} — this plan is rated for ages ${rateMeta.ageRange[0]}–${rateMeta.ageRange[1]}. Enter the premium manually below.`
                : "Set the insured's date of birth (or type an age above) to price this plan automatically."}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-2">Rates are indicative — always confirm against a formal quotation before presenting to the client. Editing $/mo or $/yr below overrides this.</p>
        </div>
      )}

      {p.key !== "RS" && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coverage breakdown{covTotal > 0 ? " — total " + money(covTotal) : ""}</span>
            <button onClick={() => setP({ coverages: [...(p.coverages || []), { id: uid(), category: "", amount: "" }] })} className="text-xs text-purple-800 hover:underline">+ Add category</button>
          </div>
          {(p.coverages || []).length === 0 && <div className="text-xs text-slate-400 mb-2">No categories yet — add one to record what this plan pays out on.</div>}
          <div className="space-y-2">
            {(p.coverages || []).map((c, j) => (
              <div key={c.id || j} className="grid grid-cols-12 gap-2">
                {/* "Others" is the catch-all, so it gets a free-text name; the rest already
                    describe themselves and stay full width */}
                <div className={c.category === "Others" ? "col-span-4" : "col-span-7"}>
                  <select value={c.category || ""} onChange={e => setCov(j, { category: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                    <option value="">Select…</option>
                    {PLAN_COVERAGE_CATEGORIES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                {c.category === "Others" && (
                  <div className="col-span-3">
                    <Input value={c.label || ""} onChange={e => setCov(j, { label: e.target.value })} placeholder="e.g. Insured Amount" title="Names this line in the report — leave blank to print as “Others”" />
                  </div>
                )}
                <div className="col-span-4"><NumInput value={c.amount} onChange={e => setCov(j, { amount: e.target.value })} placeholder="$" /></div>
                <div className="col-span-1 flex items-center"><button onClick={() => setP({ coverages: (p.coverages || []).filter((_, k) => k !== j) })} className="text-red-500 text-sm">✕</button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-12 gap-3 mt-3">
        <div className="md:col-span-2"><Field label="Coverage from age" hint="Blank = current age"><NumInput value={p.startAge} onChange={e => setP({ startAge: e.target.value })} /></Field></div>
        <div className="md:col-span-2"><Field label="Coverage to age"><NumInput value={p.endAge} onChange={e => setP({ endAge: e.target.value })} /></Field></div>
        <div className="md:col-span-3"><Field label="Premium ends at age" hint="Premium payment period"><NumInput value={p.premiumEndsAge} onChange={e => setP({ premiumEndsAge: e.target.value })} /></Field></div>
        <div className="md:col-span-2"><Field label="$/mo"><NumInput value={p.monthly} onChange={e => setP({ monthly: e.target.value })} /></Field></div>
        <div className="md:col-span-2"><Field label="$/yr"><NumInput value={p.annual} onChange={e => setP({ annual: e.target.value })} /></Field></div>
      </div>

      {p.key === "GPP" && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white/60 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!p.stepsDown} onChange={e => setP({ stepsDown: e.target.checked })} className="w-4 h-4 accent-purple-700" />
            Coverage is boosted before age 65, then steps down
          </label>
          {p.stepsDown && (
            <div className="grid md:grid-cols-3 gap-3 mt-2">
              <Field label="Boosted amount (before 65)" hint={"Steps down to " + money(covPeak) + " after age 65"}>
                <NumInput value={p.boostedAmount} onChange={e => setP({ boostedAmount: e.target.value })} placeholder="180000" />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="mt-3">
        <Field label="Projected returns note" hint="Shown in the report's Projected returns column — blank lines start a new paragraph.">
          <TextArea rows={4} value={p.returns} onChange={e => setP({ returns: e.target.value })} />
        </Field>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Images for this plan (appear in report after this plan's explanation)</span>
          <label className="text-xs text-purple-700 hover:underline cursor-pointer font-semibold">+ Upload<input type="file" accept="image/*" multiple className="hidden" onChange={async e => {
            const input = e.target;
            // Keep the File handles alive: resetting input.value before the async
            // upload/read finishes invalidates them in Chromium ("Could not read the file").
            const files = Array.from(input.files || []);
            const added = [];
            let embeddedReason = null;
            for (const file of files) {
              try {
                const { embedded, reason, ...stored } = await uploadPlanImage(file, clientId);
                if (embedded) embeddedReason = reason || embeddedReason;
                added.push({ id: uid(), name: file.name, ...stored, caption: "" });
              } catch (err) {
                toast.error("Could not add image: " + (err?.message || err));
              }
            }
            input.value = ""; // safe now that every file has been consumed
            // one update for the whole selection — per-file updates dropped all but the last
            if (added.length) onChange({ ...p, planImages: [...(p.planImages || []), ...added] });
            if (embeddedReason) toast("Image saved with the client record — storage upload failed: " + embeddedReason);
          }} /></label>
        </div>
        {(p.planImages || []).length === 0 && <div className="text-xs text-slate-400">No images yet — upload diagrams, condition lists, or benefit illustrations to include after this plan's explanation in the report.</div>}
        {(p.planImages || []).length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {(p.planImages || []).map((img, j) => (
              <div key={img.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                <PlanImage img={img} alt={img.name} className="w-full h-20 object-contain bg-slate-50" />
                <div className="p-1.5">
                  <Input value={img.caption} onChange={e => { const imgs = [...(p.planImages || [])]; imgs[j] = { ...img, caption: e.target.value }; setP({ planImages: imgs }); }} placeholder="Caption (optional)" className="text-xs" />
                  <button onClick={() => { deletePlanImage(img.path); setP({ planImages: (p.planImages || []).filter((_, k) => k !== j) }); }} className="text-red-500 text-xs mt-1">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// One plan-quotation table per insured person, sub-grouped by planning category.
// Shared by the full report and the annual review report so both read identically.
// Benefit tables attached to a plan's explanation (e.g. MSCC's insured amounts and its
// early/intermediate/major stage definitions). Inherits the report's .rpt table styling so
// the type matches the rest of the document; prose cells carry their own headings and lists.
const PlanBodyTables = ({ tables, note, riders = {} }) => (
  <div style={{ marginTop: 12 }}>
    {(tables || []).filter(tb => !tb.rider || riders[tb.rider]).map((tb, ti) => (
      <div key={ti} style={{ breakInside: "avoid", marginBottom: 14 }}>
        {tb.caption && <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#51037c", marginBottom: tb.sub ? 1 : 4 }}>{tb.caption}</div>}
        {tb.sub && <div style={{ fontSize: 11.5, fontWeight: 600, color: "#66229d", marginBottom: 4 }}>{tb.sub}</div>}
        {/* a two-column lookup table stretched to the page reads as mostly empty space,
            so width follows the column count unless the table names its own */}
        <table className="compact" style={{ tableLayout: "fixed", width: tb.width || ({ 1: "42%", 2: "52%", 3: "68%" }[tb.head.length] || "86%") }}>
          <thead><tr>{tb.head.map((h, k) => (
            <th key={k} style={{ width: tb.widths?.[k], textAlign: k === 0 ? "left" : (tb.align?.[k] || "center") }}>{h}</th>
          ))}</tr></thead>
          <tbody>{tb.rows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => (
              // a row carrying a single cell stretches across the table — used for benefits
              // that apply regardless of plan (payor waiver, renewal bonus, death benefit)
              <td key={ci} colSpan={row.length === 1 && tb.head.length > 1 ? tb.head.length : undefined}
                style={{ verticalAlign: "top", fontSize: tb.dense ? 10.5 : 11.5,
                         textAlign: ci === 0 || row.length === 1 ? "left" : (tb.align?.[ci] || "center") }}>
                {Array.isArray(cell) && typeof cell[0] === "string"
                  ? (tb.plainList
                      // items already carry their own numbering, so markers would double up
                      ? <div>{cell.map((li, li2) => <div key={li2} style={{ marginBottom: 2 }}>{li}</div>)}</div>
                      : <ul style={{ margin: 0, paddingLeft: 14, listStyle: "disc" }}>{cell.map((li, li2) => <li key={li2} style={{ marginBottom: 1 }}>{li}</li>)}</ul>)
                  : Array.isArray(cell) ? cell.map((b, bi) => {
                  // {h} names a benefit (brand colour, matching the report's h3);
                  // {t} is an underlined sub-heading; {p} prose; {ul} a bullet list
                  if (b.h) return <div key={bi} style={{ fontWeight: 700, color: "#66229d", marginBottom: 2, marginTop: bi ? 5 : 0 }}>{b.h}</div>;
                  if (b.t) return <div key={bi} style={{ fontWeight: 700, textDecoration: "underline", marginBottom: 3, marginTop: bi ? 6 : 0 }}>{b.t}</div>;
                  if (b.ul) return <ul key={bi} style={{ margin: "0 0 4px", paddingLeft: 14, listStyle: "disc" }}>{b.ul.map((li, li2) => <li key={li2} style={{ marginBottom: 1 }}>{li}</li>)}</ul>;
                  if (b.ol) return <ol key={bi} style={{ margin: "0 0 4px", paddingLeft: 18, listStyle: "decimal" }}>{b.ol.map((li, li2) => <li key={li2} style={{ marginBottom: 1 }}>{li}</li>)}</ol>;
                  return <p key={bi} style={{ margin: "0 0 5px", lineHeight: 1.45, textAlign: "left" }}>{b.p}</p>;
                }) : cell}
              </td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
    ))}
    {note && <p style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginTop: -6 }}>Note: {note}</p>}
  </div>
);

// Contents page. An entry with an `id` links to the heading carrying that id — the jump
// works on screen and survives print-to-PDF as an internal link. Entries without one
// (rows that describe a table rather than a heading) stay as plain text.
// Explanations are deduped by plan key, so the anchor is the key — that way every
// quotation row for a plan points at the one explanation written for it.
const planAnchor = (p) => "plan-" + String(p.key || "").toLowerCase();
const TocEntry = ({ id, children, style }) => id
  ? <a href={"#" + id} style={{ color: "inherit", textDecoration: "none", ...style }}>{children}</a>
  : <span style={style}>{children}</span>;
const TableOfContents = ({ entries }) => (
  <div style={{ fontSize: 13, marginTop: 18 }}>
    {entries.map((e, i) => (
      <div key={i} style={{ marginBottom: 12, breakInside: "avoid" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontWeight: 700, color: "#3a1955" }}>
          {e.num && <span style={{ width: 26, flexShrink: 0 }}>{e.num}</span>}
          <TocEntry id={e.id} style={{ textTransform: "uppercase", letterSpacing: "0.03em" }}>{e.title}</TocEntry>
          <span style={{ flex: 1, borderBottom: "2px dotted #cbd5e1", margin: "0 0 3px 8px" }} />
        </div>
        {(e.sub || []).map((sRow, j) => {
          const label = typeof sRow === "string" ? sRow : sRow.label;
          const id = typeof sRow === "string" ? null : sRow.id;
          return (
            <div key={j} style={{ display: "flex", alignItems: "baseline", color: "#475569", marginLeft: 26, fontStyle: "italic", lineHeight: 1.8 }}>
              <TocEntry id={id}>{label}</TocEntry>
              <span style={{ flex: 1, borderBottom: "1px dotted #e2e8f0", margin: "0 0 4px 8px" }} />
            </div>
          );
        })}
      </div>
    ))}
  </div>
);

const QuotationTables = ({ groups, grandMonthly, grandAnnual, optionsMode = false }) => (
  <>
    {groups.map(g => (
      <div key={g.id} style={{ breakInside: "avoid" }}>
        <h3>{g.name}{g.relationship ? " (" + g.relationship + ")" : ""}</h3>
        {/* categories appear in the order the advisor arranged their plans, not a fixed list */}
        {[...new Set(g.items.map(p => p.category))]
          .map(cat => ({ cat, items: g.items.filter(p => p.category === cat) }))
          .filter(c => c.items.length)
          .map(c => (
            <table key={c.cat} style={{ tableLayout: "fixed" }}>
              {/* Plan and Projected returns carry the wordy content, so they take the
                  width; the two premium columns only ever hold a currency figure */}
              <colgroup><col style={{ width: "27%" }} /><col style={{ width: "22%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "27%" }} /></colgroup>
              <thead><tr><th colSpan={5} style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.cat}</th></tr>
                <tr><th>Plan</th><th>Coverage</th><th className="tnum">Monthly</th><th className="tnum">Annual</th><th>Projected returns</th></tr></thead>
              <tbody>{c.items.map(p => {
                const term = planTermText(p);
                return (
                  <tr key={p.id}>
                    <td>
                      {p.key
                        ? <a href={"#" + planAnchor(p)} className="planlink" title="Jump to this plan's explanation"><b>{p.label}</b></a>
                        : <b>{p.label}</b>}
                      {/* nothing is "recommended" when the client is just browsing options */}
                      {!optionsMode && TIER_META[p.tier] && <div><span className={"inline-block text-[10px] px-1.5 py-0.5 rounded mt-1 " + TIER_META[p.tier].chip}>{TIER_META[p.tier].label}</span></div>}
                      {term && <div className="text-xs text-slate-500 mt-1">{term}</div>}
                    </td>
                    <td>{planCoverageRows(p).map((cv, k) => <div key={k}>{cv.category}: {cv.display}</div>)}</td>
                    <td className="tnum">{money(num(p.monthly), 2)}</td>
                    <td className="tnum">{money(num(p.annual), 2)}</td>
                    <td className="text-xs">{(p.returns || "").split(/\n+|\s*·\s*/).filter(Boolean).map((seg, si) => <div key={si}>{seg}</div>)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          ))}
        {groups.length > 1 && !optionsMode && (
          <table><tbody><tr>
            <td className="font-semibold">Subtotal — {g.name}</td>
            <td className="tnum font-semibold">{money(g.monthly, 2)} / month · {money(g.annual, 2)} / year</td>
          </tr></tbody></table>
        )}
      </div>
    ))}
    {groups.length > 0 && !optionsMode && (
      <table><tbody><tr>
        <td className="font-bold">Total of plans shown</td>
        <td className="tnum font-bold">{money(grandMonthly, 2)} / month · {money(grandAnnual, 2)} / year</td>
      </tr></tbody></table>
    )}
  </>
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
// Each plan type belongs to an Income Allocation bucket and feeds one specific row there,
// so a premium captured once under Current Coverage also lands in the 4-3-2-1 allocation.
// `expenseKey` matches the keys in EXPENSE_GROUPS.
const EXISTING_PLAN_TYPES = [
  { type: "Whole Life / Critical Illness", group: "protection", expenseKey: "lifeCI" },
  { type: "Accident & Hospitalisation", group: "protection", expenseKey: "accHosp" },
  { type: "Term", group: "protection", expenseKey: "term" },
  { type: "Special Life", group: "protection", expenseKey: "special" },
  { type: "Endowment", group: "savings", expenseKey: "investments" },
  { type: "Retirement Annuity", group: "savings", expenseKey: "retirement" },
];
const planTypeMeta = (t) => EXISTING_PLAN_TYPES.find(p => p.type === t) || null;
const POLICY_STATUSES = [
  ["active", "Active"],
  ["apl", "APL — premium on loan"],
  ["eti", "ETI — extended term"],
  ["lapsed", "Lapsed"],
  ["surrendered", "Surrendered"],
];
// Only an active policy is money still leaving the client's pocket each month: under APL the
// premium is funded by a loan against cash value, and ETI is paid-up.
const statusPaysPremium = (s) => (s || "active") === "active";
// Lapsed and surrendered cover no longer stands — kept on the timeline as history, greyed out.
const statusIsDead = (s) => s === "lapsed" || s === "surrendered";
const statusLabel = (s) => (POLICY_STATUSES.find(([id]) => id === (s || "active")) || POLICY_STATUSES[0])[1];
// Savings/wealth vehicles are drawn with a hatch + accumulation gradient rather than a solid bar
const isSavingsPlanType = (t) => planTypeMeta(t)?.group === "savings";
// a plan can carry coverage in several of these at once (e.g. a combined whole-life +
// CI plan has both "Death" and "Health (Major Critical Illness)" entries) — see the
// coverage-breakdown rows on ExistingPlanRow
const PLAN_COVERAGE_CATEGORIES = [
  "Death", "Disability",
  "Health (Major Critical Illness)", "Health (Early-Major Critical Illness)", "Health (Hospitalisation & Surgery)",
  "Death (Accident)", "Disability (Accident)", "Reimbursement (Accident)", "Weekly Indemnity (Accident)", "Hospitalisation (Accident)",
  "Premium Waiver (Payor)", "Premium Waiver (Insured)",
  "Retirement", "Child Savings", "Others",
];
// Some benefits are a rate, not a sum assured — a hospital income plan paying "$50" pays
// $50 a day, and reading it as a lump sum overstates the cover badly.
const CATEGORY_UNIT = {
  "Hospitalisation (Accident)": "/day",
  "Weekly Indemnity (Accident)": "/week",
  // an annuity's "amount" is the income it pays each month, not a sum assured
  "Retirement": "/mo",
};
// A rate needs its exact figure — "$1k/mo" is not a payout anyone can plan against — so a
// category carrying a unit is always written out in full rather than abbreviated.
const hasUnit = (cat) => Boolean(CATEGORY_UNIT[cat]);
const withUnit = (cat, text) => text + (CATEGORY_UNIT[cat] || "");
// broader bucket each granular category rolls up into — drives which Overview timeline
// row a plan's coverage appears on, and the Total Insurance Needs auto-totals
const CATEGORY_BUCKET = {
  "Death": "Death & Disability", "Disability": "Death & Disability",
  // major and early-major CI pay on different triggers and usually for different sums,
  // so they get their own timeline rows rather than being read as one block of cover
  "Health (Major Critical Illness)": "Major Critical Illness", "Health (Early-Major Critical Illness)": "Early-Major Critical Illness",
  // An accident plan's hospital income pays only for an accident admission; a
  // hospitalisation plan pays whatever put you in the bed. Reading them off one row makes
  // an accident-only benefit look like full hospital cover.
  "Health (Hospitalisation & Surgery)": "Hospital Stay (Any Cause)",
  "Death (Accident)": "Personal Accident", "Disability (Accident)": "Personal Accident", "Reimbursement (Accident)": "Personal Accident", "Weekly Indemnity (Accident)": "Personal Accident",
  "Hospitalisation (Accident)": "Hospital Stay (Accident)",
  // a waiver pays no sum assured — it keeps the policy alive, so it sits with "Others"
  "Premium Waiver (Payor)": "Others", "Premium Waiver (Insured)": "Others",
  "Retirement": "Retirement", "Child Savings": "Child Savings", "Others": "Others",
};
// Overview timeline row buckets, in display order
const EXISTING_PLAN_CATEGORIES = ["Death & Disability", "Major Critical Illness", "Early-Major Critical Illness", "Personal Accident", "Hospital Stay (Accident)", "Hospital Stay (Any Cause)", "Retirement", "Child Savings", "Others"];
// gap categories checked for dependents on the Overview — retirement/child-savings/others aren't flagged as "missing" for a child
const DEPENDENT_GAP_CATEGORIES = ["Death & Disability", "Major Critical Illness", "Early-Major Critical Illness", "Personal Accident", "Hospital Stay (Accident)", "Hospital Stay (Any Cause)"];
// the two critical-illness stage rows, kept together so gap logic can treat them as a pair
const CI_ROWS = ["Major Critical Illness", "Early-Major Critical Illness"];
const INVESTMENT_TYPES = ["Unit Trust", "SPK", "Stocks/Shares", "Fixed Deposit", "Savings Account", "Property", "Cash", "Other"];
// SPK pays a statutory lump sum at 60, then a fixed annuity scaled to the member's average
// serviced salary — much smaller than the lump sum, so the bar narrows past this age.
const SPK_PAYOUT_AGE = 60;
// SPK is a statutory deduction taken straight off salary, and compute() already removes it
// from gross to reach take-home income. Counting the contribution again as a savings
// commitment would charge the client for it twice, so every premium total skips it.
const isSpkHolding = (r) => r?.type === "SPK";
// SPK is a statutory scheme, so its two figures belong to the holding itself rather than
// being retyped under Retirement Planning: a lump sum at 60, then a fixed monthly annuity
// scaled to the member's average serviced salary. A figure typed on the objective still
// wins — this only fills a blank.
const spkFromHoldings = (c) => {
  const spk = (c.existingInvestments || []).find(r => r.type === "SPK" && (r.insured || "self") === "self");
  if (!spk) return null;
  return { lumpSum: num(spk.spkLumpSum), annuityMonthly: num(spk.spkAnnuityMonthly), row: spk };
};
// the objective's own value if given, otherwise whatever the SPK holding implies
const spkProjected = (c) => num(c.retirement?.spkProj) > 0 ? num(c.retirement.spkProj) : (spkFromHoldings(c)?.lumpSum || 0);
const spkAnnuityMonthlyOf = (c) => num(c.retirement?.spkAnnuityMonthly) > 0 ? num(c.retirement.spkAnnuityMonthly) : (spkFromHoldings(c)?.annuityMonthly || 0);
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

function ExistingPlanRow({ row, onChange, onRemove, dependents = [], clientDob = "" }) {
  const [adv, setAdv] = useState(false);
  const set = (k, v) => onChange({ ...row, [k]: v });
  // ages on this row are read off the policy dates, using whoever the plan insures
  const insuredDob = (!row.insured || row.insured === "self") ? clientDob : (dependents.find(dp => dp.id === row.insured)?.dob || "");
  const ageNote = (derived, legacy, lead) => {
    if (derived !== "") return lead + " age " + derived;
    if (!insuredDob) return "add the insured's date of birth to derive the age";
    if (num(legacy) > 0) return "currently age " + num(legacy) + " — set a date to replace";
    return "";
  };
  const coverages = row.coverages || [];
  const setCoverages = (next) => set("coverages", next);
  const setCoverage = (i, k, v) => setCoverages(coverages.map((c, j) => j === i ? { ...c, [k]: v } : c));
  const addCoverage = () => setCoverages([...coverages, { id: uid(), category: "", amount: "" }]);
  const removeCoverage = (i) => setCoverages(coverages.filter((_, j) => j !== i));
  const coverageTotal = coverages.reduce((s, c) => s + num(c.amount), 0);
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Plan type</label>
          <select value={row.planType || ""} onChange={e => set("planType", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">Select…</option>
            {EXISTING_PLAN_TYPES.map(t => <option key={t.type}>{t.type}</option>)}
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
          <label className="text-xs text-slate-500">Status</label>
          <select value={row.status || "active"} onChange={e => set("status", e.target.value)}
            className={"w-full rounded-lg border px-2 py-1.5 text-sm " + (statusIsDead(row.status) ? "border-slate-400 bg-slate-200 text-slate-600" : statusPaysPremium(row.status) ? "border-slate-300 bg-white" : "border-amber-300 bg-amber-50 text-amber-900")}>
            {POLICY_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 font-semibold">Coverage breakdown{coverageTotal > 0 ? " — total " + money(coverageTotal) : ""}</label>
          <button onClick={addCoverage} className="text-xs text-purple-700 hover:underline">+ Add category</button>
        </div>
        {coverages.length === 0 && <div className="text-xs text-slate-400 mb-2">No categories yet — add one to record what this plan pays out on (Death, Disability, Health, Accident…).</div>}
        <div className="space-y-2">
          {coverages.map((c, i) => (
            <div key={c.id || i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-7">
                <label className="text-xs text-slate-500">Category</label>
                <select value={c.category || ""} onChange={e => setCoverage(i, "category", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                  <option value="">Select…</option>
                  {PLAN_COVERAGE_CATEGORIES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-4">
                <label className="text-xs text-slate-500">Amount $</label>
                <NumInput value={c.amount || ""} onChange={e => setCoverage(i, "amount", e.target.value)} />
              </div>
              <div className="col-span-1 flex items-end justify-end">
                <button onClick={() => removeCoverage(i)} className="text-red-500 text-sm">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2 mt-3">
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Policy date</label>
          <Input type="date" value={row.policyDate || ""} onChange={e => set("policyDate", e.target.value)} />
          <div className="text-[11px] text-slate-400 mt-0.5">{ageNote(ageAtDate(insuredDob, row.policyDate), row.fromAge, "starts at")}</div>
        </div>
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Policy expiry</label>
          <Input type="date" value={row.policyExpiry || ""} onChange={e => set("policyExpiry", e.target.value)} />
          <div className="text-[11px] text-slate-400 mt-0.5">{ageNote(ageAtDate(insuredDob, row.policyExpiry), row.premiumEndsAge, "premiums end at")}</div>
        </div>
        {row.planType === "Retirement Annuity" && (
          <div className="col-span-3">
            <label className="text-xs text-slate-500">Payout starts at age</label>
            <NumInput value={row.payoutStartAge || ""} onChange={e => set("payoutStartAge", e.target.value)} placeholder="60" />
            <div className="text-[11px] text-slate-400 mt-0.5">annuity income begins</div>
          </div>
        )}
        {row.planType === "Retirement Annuity" && (
          <>
            <div className="col-span-3">
              <label className="text-xs text-slate-500">Expected dividend payout</label>
              <NumInput value={row.dividendPayout || ""} onChange={e => set("dividendPayout", e.target.value)} placeholder="$ over the payout years" />
              <div className="text-[11px] text-slate-400 mt-0.5">non-guaranteed</div>
            </div>
            <div className="col-span-3">
              <label className="text-xs text-slate-500">Terminal dividend</label>
              <NumInput value={row.terminalDividend || ""} onChange={e => set("terminalDividend", e.target.value)} placeholder="$ at the end of payout" />
              <div className="text-[11px] text-slate-400 mt-0.5">paid once, at maturity</div>
            </div>
          </>
        )}
        <div className="col-span-2">
          <label className="text-xs text-slate-500">{row.planType === "Retirement Annuity" ? "Payout to age" : "To age"}</label>
          <NumInput value={row.toAge || ""} onChange={e => set("toAge", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Allocation $</label>
          <NumInput value={row.allocation || ""} onChange={e => set("allocation", e.target.value)} />
          {!statusPaysPremium(row.status) && <div className="text-[11px] text-amber-700 mt-0.5">not counted in Income Allocation</div>}
        </div>
        <div className="col-span-2">
          <label className="text-xs text-slate-500">Frequency</label>
          <select value={row.allocationFreq || "monthly"} onChange={e => set("allocationFreq", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            {ALLOCATION_FREQS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </div>
        <div className="col-span-12 flex items-end">
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

function ExistingInvestmentRow({ row, onChange, onRemove, dependents = [], clientAge = null, clientDob = "" }) {
  const set = (k, v) => onChange({ ...row, [k]: v });
  const rates = row.returnRates || [];
  const monthlyEquiv = freqMonthlyEquiv(row.allocation, row.allocationFreq);
  const insuredAge = (() => {
    if (!row.insured || row.insured === "self") return clientAge;
    const dep = dependents.find(d => d.id === row.insured);
    return dep && dep.dob && calcAge(dep.dob) !== "" ? num(calcAge(dep.dob)) : null;
  })();
  // ages are read off the policy dates against whoever the plan is held for
  const insuredDob = (!row.insured || row.insured === "self") ? clientDob : (dependents.find(dp => dp.id === row.insured)?.dob || "");
  const ageNote = (derived, legacy, lead) => {
    if (derived !== "") return lead + " age " + derived;
    if (!insuredDob) return "add date of birth to derive the age";
    if (num(legacy) > 0) return "currently age " + num(legacy) + " — set a date to replace";
    return "";
  };
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
        {row.category === "Others" && (
          <div className="col-span-2">
            <label className="text-xs text-slate-500">Name this category</label>
            <Input value={row.categoryLabel || ""} onChange={e => set("categoryLabel", e.target.value)} placeholder="e.g. Endowment"
              title="Names this holding's row on the Overview timeline — leave blank to show as “Others”" />
          </div>
        )}
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
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Policy / account no.</label>
          <Input value={row.policyNumber || ""} onChange={e => set("policyNumber", e.target.value)} placeholder="e.g. UT-99881" />
        </div>
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Policy date</label>
          <Input type="date" value={row.policyDate || ""} onChange={e => set("policyDate", e.target.value)} />
          <div className="text-[11px] text-slate-400 mt-0.5">{ageNote(ageAtDate(insuredDob, row.policyDate), row.startAge, "starts at")}</div>
        </div>
        <div className="col-span-3">
          <label className="text-xs text-slate-500">Policy expiry</label>
          <Input type="date" value={row.policyExpiry || ""} onChange={e => set("policyExpiry", e.target.value)} />
          <div className="text-[11px] text-slate-400 mt-0.5">{ageNote(ageAtDate(insuredDob, row.policyExpiry), row.payUntilAge, "pay until")}</div>
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
      </div>
      {row.type === "SPK" && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-xs text-slate-500 font-semibold mb-2">SPK benefits at age {SPK_PAYOUT_AGE}</div>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3">
              <label className="text-xs text-slate-500">Projected lump sum at {SPK_PAYOUT_AGE}</label>
              <NumInput value={row.spkLumpSum || ""} onChange={e => set("spkLumpSum", e.target.value)} placeholder="$" />
            </div>
            <div className="col-span-3">
              <label className="text-xs text-slate-500">Monthly annuity from {SPK_PAYOUT_AGE}</label>
              <NumInput value={row.spkAnnuityMonthly || ""} onChange={e => set("spkAnnuityMonthly", e.target.value)} placeholder="$ / month" />
            </div>
            <div className="col-span-6 flex items-end">
              <p className="text-[11px] text-slate-400 mb-1.5">Both feed Retirement Planning under Objectives, and appear on the Overview timeline. The annuity is scaled to the member&rsquo;s average serviced salary, so it is entered rather than projected.</p>
            </div>
          </div>
        </div>
      )}
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
                      <div className="col-span-2">
                        <label className="text-xs text-slate-500">Projection years</label>
                        <NumInput value={h.years || ""} onChange={e => setHorizon(gi, hi, "years", e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        {/* the advisor thinks in ages ("project to 60"), and this is the age the
                            Overview marker uses — so it is entered, not inferred */}
                        <label className="text-xs text-slate-500">At age</label>
                        <NumInput value={h.atAge || ""} onChange={e => setHorizon(gi, hi, "atAge", e.target.value)}
                          placeholder={insuredAge != null && num(h.years) > 0 ? String(insuredAge + num(h.years)) : ""} />
                        {insuredAge != null && num(h.years) > 0 && !(num(h.atAge) > 0) && (
                          <div className="text-[10px] text-slate-400 mt-0.5">age {insuredAge + num(h.years)}</div>
                        )}
                      </div>
                      <div className="col-span-6">
                        <label className="text-xs text-slate-500">Projected value $ {auto > 0 ? "(auto: " + money(auto) + ")" : ""}</label>
                        <NumInput value={h.projectedValueOverride || ""} onChange={e => setHorizon(gi, hi, "projectedValueOverride", e.target.value)} placeholder={auto > 0 ? String(Math.round(auto)) : "auto-calculated"} />
                      </div>
                      <div className="col-span-2 flex items-end justify-end">
                        <button onClick={() => removeHorizon(gi, hi)} className="text-red-500 text-sm">✕</button>
                      </div>
                      {projected > 0 && <div className="col-span-12 text-[11px] text-slate-400 -mt-1">Projects to {money(projected)}{num(h.atAge) > 0 ? " at age " + num(h.atAge) : num(h.years) > 0 ? " in " + h.years + " years" : ""} — override if fees or a different scenario should apply.</div>}
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

// Per-policy summary, grouped by whoever is insured — the plain "what do I actually hold"
// view that sits behind the Overview timeline. Shared by the Overview step and the Review
// Report so the two can never drift apart; `report` swaps editor chrome for the .rpt styling.
// The five-tier planning pyramid, drawn inline so it scales, prints crisply and needs no
// uploaded asset. Bands run apex-first; each is the trapezoid of the triangle between two
// heights, with a white gap standing in for the separator lines.
const HIERARCHY_TIERS = [
  // the apex is narrow at its own mid-height, so its label sits lower where there is room
  { lines: ["Taxes &", "Estate"], fill: "#FFC000", shift: 14 },
  { lines: ["Retirement", "Planning"], fill: "#8CE21C" },
  { lines: ["Planning for", "Financial Goals"], fill: "#22D24E" },
  { lines: ["Risk Management"], fill: "#3ED9AF" },
  { lines: ["Contingency Planning"], fill: "#4E87C7" },
];
const HierarchyPyramid = ({ title = true }) => {
  const W = 640, H = 380, n = HIERARCHY_TIERS.length, gap = 3;
  const half = (y) => (y / H) * (W / 2);
  return (
    <svg viewBox={`0 0 ${W} ${H + (title ? 34 : 0)}`} width="100%"
      style={{ maxWidth: W, display: "block", margin: "0 auto", fontFamily: "inherit" }}
      role="img" aria-label="The Hierarchy of Needs in Financial Planning">
      {title && <text x={W / 2} y="20" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1f2937">The Hierarchy of Needs in Financial Planning</text>}
      <g transform={`translate(0 ${title ? 34 : 0})`}>
        {HIERARCHY_TIERS.map((t, i) => {
          const y0 = (H / n) * i, y1 = (H / n) * (i + 1) - gap;
          const pts = [
            [W / 2 - half(y0), y0], [W / 2 + half(y0), y0],
            [W / 2 + half(y1), y1], [W / 2 - half(y1), y1],
          ].map(([x, y]) => `${x},${y}`).join(" ");
          const mid = (y0 + y1) / 2;
          const size = i === 0 ? 17 : 19;
          // one line sits on the band's centre; two straddle it
          const firstY = (t.lines.length === 1 ? mid + size * 0.35 : mid - size * 0.15) + (t.shift || 0);
          return (
            <g key={i}>
              <polygon points={pts} fill={t.fill} />
              {t.lines.map((ln, k) => (
                <text key={k} x={W / 2} y={firstY + k * (size + 4)} textAnchor="middle"
                  fontSize={size} fill="#1f2937">{ln}</text>
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

// What the client is actually committing today, split the way the 4-3-2-1 rule splits it.
// Only active policies count — APL is funded by a loan against cash value and ETI is
// paid-up, so neither is money leaving the client's pocket. Investments sit with savings.
const currentPremiumSplit = (c) => {
  let protection = 0, savings = 0;
  (c.existingPlans || []).forEach(pl => {
    if (!statusPaysPremium(pl.status)) return;
    const m = freqMonthlyEquiv(pl.allocation ?? pl.monthly, pl.allocationFreq);
    if (m <= 0) return;
    // an untyped plan is far more likely to be insurance than an endowment
    if (planTypeMeta(pl.planType)?.group === "savings") savings += m; else protection += m;
  });
  (c.existingInvestments || []).forEach(iv => {
    if (isSpkHolding(iv)) return; // deducted from salary, not committed out of take-home pay
    const m = freqMonthlyEquiv(iv.allocation, iv.allocationFreq);
    if (m > 0) savings += m;
  });
  return { protection, savings, total: protection + savings };
};

// Annualised commitment against the 10% protection / 20% savings guidelines, so the client
// can see how much of a year's income each type of plan is already using up.
const CurrentPremiumBudget = ({ client, d }) => {
  const split = currentPremiumSplit(client);
  if (split.total <= 0) return null;
  const annualIncome = d.net * 12;
  const pct = (v) => annualIncome > 0 ? (v / annualIncome * 100).toFixed(1) + "%" : "—";
  const rows = [
    { label: "Protection plans", guidePct: 0.10, guideNote: "10% of annual income", committed: split.protection * 12,
      hint: "Whole life / critical illness, accident & hospitalisation, term and special life" },
    { label: "Savings & investment plans", guidePct: 0.20, guideNote: "20% of annual income", committed: split.savings * 12,
      hint: "Endowments, retirement annuities and investment portfolios" },
  ];
  const combinedGuide = annualIncome * 0.30, combinedCommitted = split.total * 12;
  const position = (committed, guide) => {
    if (annualIncome <= 0) return "—";
    return committed <= guide
      ? "Room of " + money(guide - committed) + " / year"
      : "Over by " + money(committed - guide) + " / year";
  };
  const tone = (committed, guide) => annualIncome > 0 && committed > guide ? "text-red-700" : "text-purple-900";
  return (
    <div className="my-4" style={{ breakInside: "avoid" }}>
      <h3 id="rv-premium-budget">Premium Commitment against the 4-3-2-1 Rule</h3>
      <p className="text-xs text-slate-500 mb-1">
        As a guideline, about <b>10%</b> of take-home income goes to protection and <b>20%</b> to savings and investments.
        Against a take-home income of <b>{money(d.net)} / month</b> — <b>{money(annualIncome)} / year</b> — this is what your
        in-force plans are already using. Lapsed, surrendered, APL and ETI policies are excluded.
      </p>
      <table>
        <thead><tr>
          <th>Allocation</th>
          <th className="tnum">Guideline / year</th>
          <th className="tnum">Committed / year</th>
          <th className="tnum">% of income</th>
          <th>Position</th>
        </tr></thead>
        <tbody>
          {rows.map(r => {
            const guide = annualIncome * r.guidePct;
            return (
              <tr key={r.label}>
                <td><b>{r.label}</b><div className="text-xs text-slate-500">{r.guideNote} · {r.hint}</div></td>
                <td className="tnum">{annualIncome > 0 ? money(guide) : "—"}</td>
                <td className="tnum">{money(r.committed)}</td>
                <td className="tnum">{pct(r.committed)}</td>
                <td className={"font-semibold " + tone(r.committed, guide)}>{position(r.committed, guide)}</td>
              </tr>
            );
          })}
          <tr style={{ background: "#f5f0fa" }}>
            <td className="font-bold">Combined commitment (30% of annual income)</td>
            <td className="tnum font-bold">{annualIncome > 0 ? money(combinedGuide) : "—"}</td>
            <td className="tnum font-bold">{money(combinedCommitted)}</td>
            <td className="tnum font-bold">{pct(combinedCommitted)}</td>
            <td className={"font-bold " + tone(combinedCommitted, combinedGuide)}>{position(combinedCommitted, combinedGuide)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-500 mt-1">
        Premiums paid other than monthly are converted to their annual equivalent so every policy compares like for like.
      </p>
    </div>
  );
};

// A dated record of where the client stood, taken at a review. Deliberately just the
// headline figures: enough for every chart here, small enough that a decade of reviews
// adds nothing meaningful to the record's size.
const snapshotFrom = (c, d, date) => {
  const split = currentPremiumSplit(c);
  return {
    id: uid(),
    date: date || new Date().toISOString().slice(0, 10),
    note: "",
    net: Math.round(d.net), expenses: Math.round(d.totalExpenses), surplus: Math.round(d.surplus),
    invested: Math.round(d.invested), cash: Math.round(d.cash), personal: Math.round(d.personal),
    totalAssets: Math.round(d.totalAssets), totalLiab: Math.round(d.totalLiab), netWorth: Math.round(d.netWorth),
    protection: Math.round(split.protection * 12), savings: Math.round(split.savings * 12),
  };
};
const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || ""));
const histYear = (h) => String(h.date || "").slice(0, 4) || "—";

// Two small charts drawn as plain SVG so they print with the rest of the report: net income
// per month over time, and assets against liabilities with the net-worth gap between them.
const ProgressCharts = ({ history }) => {
  const rows = [...history].filter(r => r.date).sort(byDate);
  if (rows.length < 2) return null;
  const W = 300, H = 132, L = 46, R = 8, T = 12, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const xAt = (i) => L + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);

  const chart = (title, series, opts = {}) => {
    const all = series.flatMap(sr => sr.values);
    const top = Math.max(...all, 1) * 1.12;
    const y = (v) => T + ih - (v / top) * ih;
    return (
      <div style={{ breakInside: "avoid" }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#51037c", marginBottom: 2 }}>{title}</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }} role="img" aria-label={title}>
          {[0, 0.5, 1].map(f => (
            <g key={f}>
              <line x1={L} y1={T + ih - f * ih} x2={W - R} y2={T + ih - f * ih} stroke="#e2e8f0" strokeWidth="1" />
              <text x={L - 5} y={T + ih - f * ih + 3} textAnchor="end" fontSize="7.5" fill="#94a3b8">{kfmt(top * f)}</text>
            </g>
          ))}
          {opts.bars
            ? series.map((sr, si) => rows.map((r, i) => {
                const bw = Math.max(4, Math.min(14, iw / (rows.length * series.length + 1)));
                const bx = xAt(i) - (series.length * bw) / 2 + si * bw;
                return <rect key={sr.label + i} x={bx} y={y(sr.values[i])} width={bw - 1} height={Math.max(0, T + ih - y(sr.values[i]))} fill={sr.color} rx="1" />;
              }))
            : series.map(sr => (
                <g key={sr.label}>
                  <polyline fill="none" stroke={sr.color} strokeWidth="2" points={rows.map((r, i) => `${xAt(i)},${y(sr.values[i])}`).join(" ")} />
                  {rows.map((r, i) => <circle key={i} cx={xAt(i)} cy={y(sr.values[i])} r="2.5" fill={sr.color} />)}
                </g>
              ))}
          {rows.map((r, i) => <text key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="7.5" fill="#64748b">{histYear(r)}</text>)}
        </svg>
        <div style={{ fontSize: 9.5, color: "#64748b", marginTop: -2 }}>
          {series.map((sr, i) => (
            <span key={sr.label} style={{ marginRight: 10 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: sr.color, marginRight: 4 }} />{sr.label}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, margin: "10px 0 6px" }}>
      {chart("Take-home income per month", [{ label: "Net income", color: "#51037c", values: rows.map(r => num(r.net)) }])}
      {chart("Assets vs liabilities", [
        { label: "Total assets", color: "#059669", values: rows.map(r => num(r.totalAssets)) },
        { label: "Total liabilities", color: "#dc2626", values: rows.map(r => num(r.totalLiab)) },
      ], { bars: true })}
    </div>
  );
};

// The same figures as a table, with the movement since the previous review — the number the
// client actually wants: am I further ahead than last year.
const ProgressTable = ({ history, report = false }) => {
  const rows = [...history].filter(r => r.date).sort(byDate);
  if (!rows.length) return null;
  const delta = (cur, prev) => {
    if (prev == null) return "—";
    const diff = num(cur) - num(prev);
    if (diff === 0) return "no change";
    return (diff > 0 ? "▲ " : "▼ ") + money(Math.abs(diff));
  };
  const td = report ? undefined : "py-1.5 px-2 border-b border-slate-100 align-top";
  const th = report ? undefined : "text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1 px-2 bg-slate-50 border-b border-slate-200";
  return (
    <table className={report ? undefined : "w-full text-sm border border-slate-200 rounded-lg overflow-hidden"}>
      <thead><tr>
        <th className={th}>Review</th>
        <th className={th} style={{ textAlign: "right" }}>Net income /mo</th>
        <th className={th} style={{ textAlign: "right" }}>Total assets</th>
        <th className={th} style={{ textAlign: "right" }}>Total liabilities</th>
        <th className={th} style={{ textAlign: "right" }}>Net worth</th>
        <th className={th}>Net worth vs previous</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id || i}>
            <td className={td}><b>{fmtDate(r.date) || r.date}</b>{r.note ? <div className="text-xs text-slate-500">{r.note}</div> : null}</td>
            <td className={td} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(num(r.net))}</td>
            <td className={td} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(num(r.totalAssets))}</td>
            <td className={td} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(num(r.totalLiab))}</td>
            <td className={td} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{money(num(r.netWorth))}</td>
            <td className={td} style={{ color: i === 0 ? "#64748b" : (num(r.netWorth) >= num(rows[i - 1].netWorth) ? "#15803d" : "#b91c1c"), fontWeight: 600 }}>
              {delta(r.netWorth, i === 0 ? null : rows[i - 1].netWorth)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Advisor-side panel: capture today's figures, and hand-edit or backfill past reviews.
const ProgressPanel = ({ client, d, update }) => {
  const rows = [...(client.history || [])].sort(byDate);
  const setRows = (next) => update({ history: next });
  const patch = (id, p) => setRows((client.history || []).map(r => r.id === id ? { ...r, ...p } : r));
  const capture = () => {
    const snap = snapshotFrom(client, d);
    const clash = rows.find(r => r.date === snap.date);
    if (clash && !confirm("A snapshot already exists for " + fmtDate(snap.date) + ". Add another for the same date?")) return;
    setRows([...(client.history || []), snap]);
  };
  const addBlank = () => setRows([...(client.history || []), {
    id: uid(), date: "", note: "", net: "", expenses: "", surplus: "",
    invested: "", cash: "", personal: "", totalAssets: "", totalLiab: "", netWorth: "", protection: "", savings: "",
  }]);
  const num2 = (v) => v === "" || v == null ? "" : v;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={capture} className="bg-purple-700 hover:bg-purple-800 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors">
          ＋ Capture today's figures
        </button>
        <button onClick={addBlank} className="text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
          Add a past review by hand
        </button>
        <span className="text-xs text-slate-500">Takes the totals as they stand now: income, assets, liabilities and premiums.</span>
      </div>
      {rows.length === 0 && (
        <div className="text-sm text-slate-400">No snapshots yet. Capture one at the end of a review, or type in past years from your own records — two or more make the charts.</div>
      )}
      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
              <thead><tr>
                {["Date", "Note", "Net income /mo", "Total assets", "Total liabilities", "Net worth", ""].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1 px-2 bg-slate-50 border-b border-slate-200">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="py-1.5 px-2 border-b border-slate-100"><Input type="date" value={r.date || ""} onChange={e => patch(r.id, { date: e.target.value })} className="text-sm" /></td>
                    <td className="py-1.5 px-2 border-b border-slate-100"><Input value={r.note || ""} onChange={e => patch(r.id, { note: e.target.value })} placeholder="e.g. 2025 annual review" className="text-sm" /></td>
                    <td className="py-1.5 px-2 border-b border-slate-100"><NumInput value={num2(r.net)} onChange={e => patch(r.id, { net: e.target.value })} /></td>
                    <td className="py-1.5 px-2 border-b border-slate-100"><NumInput value={num2(r.totalAssets)} onChange={e => patch(r.id, { totalAssets: e.target.value })} /></td>
                    <td className="py-1.5 px-2 border-b border-slate-100"><NumInput value={num2(r.totalLiab)} onChange={e => patch(r.id, { totalLiab: e.target.value })} /></td>
                    <td className="py-1.5 px-2 border-b border-slate-100">
                      <NumInput value={num2(r.netWorth)} onChange={e => patch(r.id, { netWorth: e.target.value })} />
                      {(num(r.totalAssets) > 0 || num(r.totalLiab) > 0) && num(r.netWorth) !== num(r.totalAssets) - num(r.totalLiab) && (
                        <button onClick={() => patch(r.id, { netWorth: num(r.totalAssets) - num(r.totalLiab) })}
                          className="block text-[11px] text-purple-700 hover:underline mt-0.5">set to {money(num(r.totalAssets) - num(r.totalLiab))}</button>
                      )}
                    </td>
                    <td className="py-1.5 px-2 border-b border-slate-100">
                      <button onClick={() => { if (confirm("Delete the snapshot dated " + (fmtDate(r.date) || "—") + "?")) setRows((client.history || []).filter(x => x.id !== r.id)); }} className="text-red-500 text-sm">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-2">A captured snapshot also stores expenses, the asset split and the annual premium commitment, which the report uses even though they are not editable here.</p>
          {rows.length >= 2 && <div className="mt-4"><ProgressCharts history={rows} /></div>}
        </>
      )}
    </>
  );
};

const CurrentPlansTable = ({ client, report = false }) => {
  const people = [
    { id: "self", name: client.name || "Client", age: calcAge(client.dob) },
    ...(client.dependents || []).map((dep, i) => ({
      id: dep.id, name: dep.name || "Dependent " + (i + 1),
      relationship: dep.relationship || "", age: calcAge(dep.dob),
    })),
  ];
  const rowsFor = (id) => [
    ...(client.existingPlans || []).filter(x => (x.insured || "self") === id).map(x => ({
      kind: "plan", id: x.id, policyNo: x.policyNumber, date: x.policyDate,
      name: x.planName || x.planType || "Existing plan", sub: x.planName ? x.planType : "",
      status: x.status || "active",
      cover: (x.coverages || []).filter(c => c.category && num(c.amount) > 0)
        .map(c => c.category + ": " + money(num(c.amount))),
      premium: num(x.allocation ?? x.monthly), freq: x.allocationFreq,
    })),
    ...(client.existingInvestments || []).filter(x => (x.insured || "self") === id).map(x => ({
      kind: "investment", id: x.id, policyNo: x.policyNumber, date: x.policyDate,
      name: x.description || x.type || "Investment", sub: x.type && x.description ? x.type : "",
      status: "active", offSalary: isSpkHolding(x),
      cover: num(x.currentValue) > 0 ? ["Current value: " + money(num(x.currentValue))] : [],
      premium: num(x.allocation), freq: x.allocationFreq,
    })),
  ];
  const groups = people.map(pp => ({ ...pp, rows: rowsFor(pp.id) })).filter(g => g.rows.length);
  if (!groups.length) {
    return <div className={report ? "italic text-slate-400" : "text-sm text-slate-400"}>No policies captured yet — add them in the Current Coverage step.</div>;
  }
  const th = report ? undefined : "text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1 px-2 bg-slate-50 border-b border-slate-200";
  const td = report ? undefined : "py-1.5 px-2 border-b border-slate-100 align-top";
  return (
    <>
      {groups.map(g => {
        // frequencies differ per policy, so the only honest total is a monthly equivalent —
        // and only for policies actually being paid for right now
        const monthly = g.rows.filter(r => statusPaysPremium(r.status) && !r.offSalary)
          .reduce((sum, r) => sum + freqMonthlyEquiv(r.premium, r.freq), 0);
        return (
          <div key={g.id} style={{ breakInside: "avoid" }} className={report ? "" : "mb-5"}>
            <div className={report ? "" : "font-semibold text-sm text-purple-900 mb-1"}>
              {report
                ? <h3>{g.name}{g.relationship ? " (" + g.relationship + ")" : ""}{g.age !== "" ? " — age " + g.age : ""}</h3>
                : <>{g.name}{g.relationship ? " (" + g.relationship + ")" : ""}{g.age !== "" ? " — age " + g.age : ""}</>}
            </div>
            <table className={report ? undefined : "w-full text-sm border border-slate-200 rounded-lg overflow-hidden"}>
              <thead><tr>
                <th className={th}>Policy No.</th>
                <th className={th}>Policy Date</th>
                <th className={th}>Current Policy(s) / Portfolio</th>
                <th className={th}>Coverage</th>
                <th className={th} style={{ textAlign: "right" }}>Premium</th>
                <th className={th}>Mode</th>
              </tr></thead>
              <tbody>
                {g.rows.map((r, i) => {
                  const dead = statusIsDead(r.status);
                  return (
                    <tr key={r.id || i} style={dead ? { opacity: 0.55 } : undefined}>
                      <td className={td}>{r.policyNo || "—"}</td>
                      <td className={td}>{fmtDate(r.date) || "—"}</td>
                      <td className={td}>
                        <b>{r.name}</b>
                        {r.sub ? <div className="text-xs text-slate-500">{r.sub}</div> : null}
                        {r.kind === "investment" && <div className="text-xs text-slate-500">Investment portfolio</div>}
                        {r.status !== "active" && <div className="text-xs font-semibold" style={{ color: dead ? "#64748b" : "#b45309" }}>{statusLabel(r.status)}</div>}
                        {r.offSalary && <div className="text-xs text-slate-500">Deducted from salary — not counted in the total</div>}
                      </td>
                      <td className={td}>{r.cover.length ? r.cover.map((c, j) => <div key={j}>{c}</div>) : "—"}</td>
                      <td className={td} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.premium > 0 ? money(r.premium, 2) : "—"}</td>
                      <td className={td}>{r.premium > 0 ? freqLabel(r.freq) : "—"}</td>
                    </tr>
                  );
                })}
                {monthly > 0 && (
                  <tr>
                    <td className={td} colSpan={4} style={{ fontWeight: 600 }}>Total being paid — monthly equivalent</td>
                    <td className={td} style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{money(monthly, 2)}</td>
                    <td className={td}>Monthly</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
};

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
              clientDob={client.dob}
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
              clientDob={client.dob}
              onChange={next => { const l = [...invs]; l[i] = next; update({ existingInvestments: l }); }}
              onRemove={() => update({ existingInvestments: invs.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      </Collapsible>
    </>
  );
}

// Renders a plan image from either shape: legacy embedded base64 (img.dataUrl, shown
// immediately) or a storage path (img.path, resolved to a short-lived signed URL first).
const PlanImage = ({ img, ...imgProps }) => {
  const [url, setUrl] = useState(img.dataUrl || null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (img.dataUrl || !img.path) return;
    let cancelled = false;
    setErr(null);
    signedPlanImageUrl(img.path)
      .then(u => { if (!cancelled) setUrl(u); })
      .catch(e => {
        console.error("[plan images] could not load image", img.path, e);
        if (!cancelled) setErr(e?.message || "Image unavailable");
      });
    return () => { cancelled = true; };
  }, [img.dataUrl, img.path]);
  if (err) return <div className="w-full h-full flex items-center justify-center text-[10px] text-rose-600 bg-rose-50 text-center px-1">{err}</div>;
  if (!url) return <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 bg-slate-50">Loading…</div>;
  return <img src={url} {...imgProps} />;
};

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
  SWB: () => 100,                              // accumulates to maturity (age 125, clipped to the axis)
  SFR: (start) => Math.min(start + 20, 100),   // default 20-year policy term
  SFG: (start) => Math.min(start + 20, 100),   // 5-pay, but cover runs to maturity — default 20-year policy term
};
const INSURED_COLORS = ["#51037c", "#2563eb", "#059669", "#d97706", "#0891b2", "#be185d", "#65a30d", "#475569"];

// coverage $ totals per insured, summed from each plan's granular coverage-breakdown
// categories into the three points of coverage — a plan with both a "Death" and a
// "Health (Major Critical Illness)" entry counts toward both Life and Health
const NEEDS_TRIANGLE_GROUPS = [
  { key: "health", label: "Health Benefits", categories: ["Health (Major Critical Illness)", "Health (Early-Major Critical Illness)", "Health (Hospitalisation & Surgery)"], corner: { x: 108, y: 96 } },
  { key: "life", label: "Life Protection", categories: ["Death", "Disability"], corner: { x: 352, y: 96 } },
  // a daily hospital income is a rate, not a sum assured, so it is left out of the
  // accident total rather than added to lump-sum benefits as if it were one
  { key: "accident", label: "Accident Coverage", categories: ["Death (Accident)", "Disability (Accident)", "Reimbursement (Accident)"], corner: { x: 230, y: 344 } },
];

function InsuranceNeedsTriangle({ person, plans, overrides, setOverride }) {
  const autoTotal = (categories) => plans
    .filter(p => (p.insured || "self") === person.id)
    .flatMap(p => p.coverages || [])
    .filter(c => categories.includes(c.category))
    .reduce((s, c) => s + num(c.amount), 0);
  const values = NEEDS_TRIANGLE_GROUPS.map(g => {
    const auto = autoTotal(g.categories);
    const raw = overrides[g.key];
    const isOverridden = raw != null && raw !== "";
    return { ...g, auto, value: isOverridden ? num(raw) : auto, isOverridden, raw };
  });
  // Deliberately no combined figure: Health, Life and Accident cover answer different
  // questions and pay out on different events, so adding them into one "total" would
  // overstate what the client is actually protected for.
  const W = 460, H = 440, CENTER = { x: 230, y: 214 }, R_CORNER = 48;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: "block", margin: "0 auto", fontFamily: "inherit" }}>
      <polygon points={values.map(v => v.corner.x + "," + v.corner.y).join(" ")} fill="#f5f0fa" stroke="#d8b4fe" strokeWidth="2" />
      {values.map(v => {
        // the lower corner carries its label beneath the node so it stays clear of the
        // triangle's edges; the upper two sit above
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
// Health/Life/Accident cells auto-total from each plan's coverage breakdown (shown as
// the placeholder, editable/overridable like the triangle); Savings has no equivalent
// granular source on a plan, so it stays a plain manual entry.
function InsuranceNeedsDetailTables({ tables, setField, plans, personId }) {
  const t = tables || {};
  const mine = useMemo(() => plans.filter(p => (p.insured || "self") === personId).flatMap(p => p.coverages || []), [plans, personId]);
  const autoFor = (categories) => {
    const sum = mine.filter(c => categories.includes(c.category)).reduce((s, c) => s + num(c.amount), 0);
    return sum > 0 ? fmt(sum) : "—";
  };
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
          <tr><th className={subhead + " text-center"}>Hosp. &amp; Surgery</th><th className={subhead + " text-center"}>Early-Major</th><th className={subhead + " text-center"}>Major</th></tr>
        </thead>
        <tbody><tr>
          <td className={td}><TCell value={t.health?.minor} onChange={e => setField("health.minor", e.target.value)} placeholder={autoFor(["Health (Hospitalisation & Surgery)"])} align="center" /></td>
          <td className={td}><TCell value={t.health?.early} onChange={e => setField("health.early", e.target.value)} placeholder={autoFor(["Health (Early-Major Critical Illness)"])} align="center" /></td>
          <td className={td}><TCell value={t.health?.major} onChange={e => setField("health.major", e.target.value)} placeholder={autoFor(["Health (Major Critical Illness)"])} align="center" /></td>
        </tr></tbody>
      </table>

      <table className="w-full border-collapse h-fit">
        <thead><tr><th className={th} colSpan={2}>Accident Coverage</th></tr></thead>
        <tbody>
          <tr><td className={subhead} colSpan={2}>Major</td></tr>
          <tr><td className={td + " text-xs px-2"}>Death</td><td className={td}><TCell value={t.accidentMajor?.death} onChange={e => setField("accidentMajor.death", e.target.value)} placeholder={autoFor(["Death (Accident)"])} /></td></tr>
          <tr><td className={td + " text-xs px-2"}>TP Disability</td><td className={td}><TCell value={t.accidentMajor?.tpDisability} onChange={e => setField("accidentMajor.tpDisability", e.target.value)} placeholder={autoFor(["Disability (Accident)"])} /></td></tr>
          <tr><td className={subhead} colSpan={2}>Minor</td></tr>
          <tr><td className={td + " text-xs px-2"}>Hospital Expenses</td><td className={td}><TCell value={t.accidentMinor?.hospitalExpenses} onChange={e => setField("accidentMinor.hospitalExpenses", e.target.value)} placeholder={autoFor(["Reimbursement (Accident)"])} /></td></tr>
          <tr><td className={td + " text-xs px-2"}>Week Indemnity</td><td className={td}><TCell value={t.accidentMinor?.weekIndemnity} onChange={e => setField("accidentMinor.weekIndemnity", e.target.value)} placeholder={autoFor(["Weekly Indemnity (Accident)"])} /></td></tr>
          <tr><td className={td + " text-xs px-2"}>Hospital Benefit</td><td className={td}><TCell value={t.accidentMinor?.hospitalBenefit} onChange={e => setField("accidentMinor.hospitalBenefit", e.target.value)} placeholder={autoFor(["Hospitalisation (Accident)"])} /></td></tr>
        </tbody>
      </table>

      <div className="space-y-3">
        <table className="w-full border-collapse">
          <thead><tr><th className={th} colSpan={2}>Life Protection</th></tr></thead>
          <tbody>
            <tr><td className={td + " text-xs px-2"}>Death</td><td className={td}><TCell value={t.life?.death} onChange={e => setField("life.death", e.target.value)} placeholder={autoFor(["Death"])} /></td></tr>
            <tr><td className={td + " text-xs px-2"}>TP Disability</td><td className={td}><TCell value={t.life?.tpDisability} onChange={e => setField("life.tpDisability", e.target.value)} placeholder={autoFor(["Disability"])} /></td></tr>
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
  // Lapsed and surrendered policies pay out nothing, so they must not close a coverage gap.
  // APL and ETI policies are still in force — their cover counts even though no premium is
  // leaving the client's pocket.
  const plans = useMemo(() => (client.existingPlans || []).filter(p => !statusIsDead(p.status)), [client.existingPlans]);
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
            <InsuranceNeedsDetailTables tables={detailTables[person.id]} setField={(path, v) => setTableField(person.id, path, v)} plans={plans} personId={person.id} />
          </div>
        ))}
        {persons.length === 0 && <div className="text-sm text-slate-400">Add existing plans in the Current Coverage step to see this summary.</div>}
      </div>
    </div>
  );
}

// The full 0–100 axis squeezes every bar so tight that the plan labels on them truncate.
// A printed timeline can't be zoomed by the reader, so it opens on the years that are
// actually in play — a little before today, through retirement and past it.
const printedWindow = (age, ret) => {
  if (!(age > 0)) return { a0: 0, a1: TIMELINE_MAX_AGE };
  const a0 = Math.max(0, age - 6);
  const a1 = Math.min(TIMELINE_MAX_AGE, Math.max(age + 30, ret > 0 ? ret + 8 : 0, a0 + 25));
  return { a0, a1 };
};
function CoverageTimelinePanel({ client, printMode = false }) {
  const clientAge = num(calcAge(client.dob));
  const retireAge = num(client.retirementAge); // from Profile (KYC) step
  const [mode, setMode] = useState("current");
  const [win, setWin] = useState(() => printMode ? printedWindow(clientAge, retireAge) : { a0: 0, a1: TIMELINE_MAX_AGE }); // visible client-age window (zoom)
  const [hover, setHover] = useState(null);       // { item, left, top }
  const [selected, setSelected] = useState(null); // pinned item for the detail card
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const winRef = useRef(win); winRef.current = win;

  // everyone a plan can insure: the client plus each dependent, each with a colour
  const insuredList = useMemo(() => [
    { id: "self", name: client.name || "Client", age: clientAge || null, dob: client.dob, color: INSURED_COLORS[0] },
    ...(client.dependents || []).map((dep, i) => ({
      id: dep.id, name: dep.name || "Dependent " + (i + 1),
      age: dep.dob && calcAge(dep.dob) !== "" ? num(calcAge(dep.dob)) : null,
      dob: dep.dob,
      color: INSURED_COLORS[(i + 1) % INSURED_COLORS.length],
    })),
  ], [client.dependents, client.name, client.dob, clientAge]);
  const insuredById = (id) => insuredList.find(p => p.id === id) || insuredList[0];
  // bars sit on the CLIENT's age axis: shift each insured person's ages by the age gap
  const offsetOf = (who) => (who.age != null && clientAge > 0 ? clientAge - who.age : 0);
  const kfmt = (v) => v >= 1000000 ? "$" + fmt(v / 1000000, 1) + "M" : v >= 1000 ? "$" + fmt(v / 1000, v % 1000 ? 1 : 0) + "k" : v > 0 ? "$" + fmt(v) : "";

  const items = useMemo(() => {
    // a plan can carry coverage in several granular categories at once (e.g. Death +
    // Health (Major Critical Illness)) — group those by the timeline bucket they roll
    // up into, so the plan shows one bar per bucket (Death & Disability, Critical
    // Illness, …), each labelled with that bucket's representative coverage amount.
    // Reused in Recommended mode too, so current coverage can be compared against proposals.
    const buildPlanItems = () => (client.existingPlans || []).flatMap((p, i) => {
        const dob = insuredById(p.insured || "self").dob;
        const start = Math.max(0, Math.min(policyStartAge(p, dob), TIMELINE_MAX_AGE));
        const rawEnd = num(p.endAge ?? p.toAge);
        const end = Math.max(Math.min(rawEnd > 0 ? rawEnd : TIMELINE_MAX_AGE, TIMELINE_MAX_AGE), start);
        const who = insuredById(p.insured || "self");
        const stepAge = num(p.stepDownAge), stepAmt = num(p.stepDownAmount);
        const hasStep = stepAge > start && stepAge < end && stepAmt > 0;
        const allocAmt = num(p.allocation ?? p.monthly);
        const premEnd = policyPremiumEndAge(p, dob);
        const label = p.planName || p.planType || "Existing plan";
        const byBucket = new Map();
        (p.coverages || []).filter(c => c.category && num(c.amount) > 0).forEach(c => {
          const bucket = CATEGORY_BUCKET[c.category] || "Others";
          if (!byBucket.has(bucket)) byBucket.set(bucket, []);
          byBucket.get(bucket).push(c);
        });
        if (byBucket.size === 0) return [];
        return [...byBucket.entries()].map(([bucket, covs]) => ({
          id: (p.id || "cur" + i) + "-" + bucket,
          origin: "current",
          label, category: bucket, start, end, insured: who, offset: offsetOf(who),
          covShort: withUnit(covs[0]?.category, (hasUnit(covs[0]?.category) ? money : kfmt)(Math.max(...covs.map(c => num(c.amount))))),
          stepAge: hasStep ? stepAge : null, stepAmt: hasStep ? stepAmt : null,
          premStart: premEnd > start ? start : null, premEnd: premEnd > start ? premEnd : null,
          status: p.status || "active",
          savings: isSavingsPlanType(p.planType),
          // a deferred annuity reads in three acts: pay in, wait, then draw income
          payoutStart: p.planType === "Retirement Annuity" && num(p.payoutStartAge) > 0 ? num(p.payoutStartAge) : null,
          terminalDividend: num(p.terminalDividend),
          details: [
            ["Insured", who.name + (who.age != null ? " (age " + who.age + ")" : "")],
            ["Plan type", p.planType], ["Status", statusLabel(p.status)],
            ["Policy number", p.policyNumber],
            ["Annuity payout", p.planType === "Retirement Annuity" && num(p.payoutStartAge) > 0 ? "age " + num(p.payoutStartAge) + " – " + end : ""],
            ["Expected dividends", num(p.dividendPayout) > 0 ? money(num(p.dividendPayout)) : ""],
            ["Terminal dividend", num(p.terminalDividend) > 0 ? money(num(p.terminalDividend)) : ""],
            ["Policy date", fmtDate(p.policyDate)],
            ...covs.map(c => [c.category, money(num(c.amount))]),
            ["Coverage ages", start + " – " + end + " (own age)"],
            ["Steps down", hasStep ? "to " + money(stepAmt) + " at age " + stepAge : ""],
            ["Allocation", allocAmt > 0 ? money(allocAmt, 2) + " / " + freqLabel(p.allocationFreq).toLowerCase() : ""],
            ["Premium ends", premEnd > 0 ? "age " + premEnd + (p.policyExpiry ? " (" + fmtDate(p.policyExpiry) + ")" : "") : ""],
            ["Notes", p.notes],
          ].filter(([, v]) => v),
        }));
      });

    if (mode === "current") {
      const plans = buildPlanItems();
      const invs = (client.existingInvestments || []).map((r, i) => {
        const invDob = insuredById(r.insured || "self").dob;
        const start = Math.max(0, Math.min(policyStartAge(r, invDob), TIMELINE_MAX_AGE));
        const monthlyEquiv = freqMonthlyEquiv(r.allocation, r.allocationFreq);
        // flatten rate groups → individual horizon points for the headline figure + details list
        const horizons = (r.returnRates || []).flatMap(g => (g.horizons || []).map(h => ({
          rate: num(g.rate), years: num(h.years), atAge: num(h.atAge),
          projected: num(h.projectedValueOverride) > 0 ? num(h.projectedValueOverride) : projectFV({ current: r.currentValue, contrib: monthlyEquiv, rate: g.rate, years: h.years }, 0),
        }))).filter(h => h.years > 0);
        const maxYears = horizons.reduce((m, h) => Math.max(m, h.years), 0);
        const headline = horizons.filter(h => h.years === maxYears).reduce((best, h) => (!best || h.projected > best.projected) ? h : best, null);
        const toAgeSet = num(r.toAge) > start;
        const end = toAgeSet ? Math.min(num(r.toAge), TIMELINE_MAX_AGE) : Math.min(start + (maxYears > 0 ? maxYears : TIMELINE_MAX_AGE - start), TIMELINE_MAX_AGE);
        const who = insuredById(r.insured || "self");
        const owner = insuredById(r.owner || "self");
        const payUntil = policyPremiumEndAge(r, invDob);
        // Horizons run from today (they grow the *current* value), so a 12-year horizon
        // lands at the insured's current age + 12 — not at the policy's start age.
        const baseAge = who.age != null ? who.age : start;
        // an explicitly entered age wins: it is what the advisor means, and it avoids the
        // off-by-one that creeps in when a horizon is converted through today's age
        const projections = horizons.map(h => {
          const age = h.atAge > 0 ? h.atAge : baseAge + h.years;
          return { ...h, age, year: new Date().getFullYear() + (age - baseAge) };
        });
        return {
          id: r.id || "inv" + i,
          origin: "current",
          label: r.description || r.type || "Investment",
          // a named "Others" holding gets its own timeline row under that name
          category: (r.category === "Others" && String(r.categoryLabel || "").trim()) || r.category || "Investment Portfolio",
          start, end, insured: who, offset: offsetOf(who),
          covShort: r.type === "SPK"
            // SPK's story is the two things it pays, not its running balance
            ? [num(r.spkLumpSum) > 0 ? kfmt(num(r.spkLumpSum)) + " at " + SPK_PAYOUT_AGE : null,
               num(r.spkAnnuityMonthly) > 0 ? money(num(r.spkAnnuityMonthly)) + "/mo after" : null]
                .filter(Boolean).join(" · ") || kfmt(num(r.currentValue))
            : kfmt(num(r.currentValue)) + (headline && headline.projected > num(r.currentValue) ? " → " + kfmt(headline.projected) : ""),
          spkAnnuityMonthly: num(r.spkAnnuityMonthly),
          stepAge: null, stepAmt: null, status: "active", savings: true, payoutStart: null,
          lumpSumAge: r.type === "SPK" && end > SPK_PAYOUT_AGE ? SPK_PAYOUT_AGE : null,
          premStart: payUntil > start ? start : null, premEnd: payUntil > start ? payUntil : null,
          details: [
            ["Insured", who.name + (who.age != null ? " (age " + who.age + ")" : "")],
            ["Policy owner", owner.name], ["Type", r.type], ["Category", r.category],
            ["Policy date", fmtDate(r.policyDate)],
            ["Coverage ages", start + " – " + end],
            ["Current value", num(r.currentValue) > 0 ? money(num(r.currentValue)) : ""],
            ["Allocation", num(r.allocation) > 0 ? money(num(r.allocation), 2) + " / " + freqLabel(r.allocationFreq).toLowerCase() : ""],
            ["Pay until", payUntil > 0 ? "age " + payUntil + (r.policyExpiry ? " (" + fmtDate(r.policyExpiry) + ")" : "") : ""],
            ["Notes", r.notes],
          ].filter(([, v]) => v),
          projections,
        };
      });
      return [...plans, ...invs];
    }

    // recommended mode: layer current plans (muted) under the recommended products
    // (highlighted) so the advisor can see how the proposal stacks against what's
    // already in force, category row by category row
    // Recommended plans are bucketed by their coverage breakdown exactly like in-force
    // plans, so a proposal lands on the same row as the cover it is meant to top up.
    const recommended = (client.products || []).filter(p => p.include).flatMap((p, i) => {
      const who = insuredById(p.insuredBy || "self");
      const baseAge = who.age != null ? who.age : clientAge;
      const start = Math.max(0, Math.min(num(p.startAge) > 0 ? num(p.startAge) : baseAge, TIMELINE_MAX_AGE));
      let end = num(p.endAge) || num(p.cciOption);
      if (!end) end = (RECO_END_AGE[p.key] || (() => TIMELINE_MAX_AGE))(start);
      end = Math.min(Math.max(end, start), TIMELINE_MAX_AGE);
      const premEnd = num(p.premiumEndsAge);
      // GPP-style boost: the bar carries the boosted sum until 65, then drops to the
      // plan's own breakdown total
      const baseTotal = Math.max(0, ...(p.coverages || []).map(c => num(c.amount)));
      const boosted = p.stepsDown && num(p.boostedAmount) > baseTotal ? num(p.boostedAmount) : 0;
      const hasStep = boosted > 0 && start < 65 && end > 65;
      const covRows = planCoverageRows(p);
      const common = {
        origin: "recommended",
        label: p.label, start, end, insured: who, offset: offsetOf(who),
        stepAge: hasStep ? 65 : null, stepAmt: hasStep ? baseTotal : null,
        status: "active", savings: p.category !== "Risk Management",
        payoutStart: p.key === "RS" && num(p.retirementAge) > 0 ? num(p.retirementAge) : null,
        premStart: premEnd > start ? start : null, premEnd: premEnd > start ? premEnd : null,
        details: [
          ["Insured", who.name + (who.age != null ? " (age " + who.age + ")" : "")],
          ["Tier", TIER_META[p.tier] ? TIER_META[p.tier].label : ""],
          ...covRows.map(c => [c.category, c.display]),
          ["Boosted until 65", boosted > 0 ? money(boosted) + " → " + money(baseTotal) + " after 65" : ""],
          ["Coverage ages", start + " – " + end + " (own age)"],
          ["Premium ends", premEnd > 0 ? "age " + premEnd : ""],
          ["Premium", num(p.monthly) > 0 ? money(num(p.monthly), 2) + "/mo · " + money(num(p.annual), 2) + "/yr" : ""],
          ["Projected returns", p.returns],
        ].filter(([, v]) => v),
      };
      // an annuity has no coverage breakdown — it sits on the Retirement row on its own
      if (p.key === "RS") {
        return [{ ...common, id: "reco-" + p.id + "-RS", category: "Retirement", covShort: money(num(p.monthlyIncome)) + "/mo" }];
      }
      const byBucket = new Map();
      (p.coverages || []).filter(c => c.category && num(c.amount) > 0).forEach(c => {
        const bucket = CATEGORY_BUCKET[c.category] || "Others";
        if (!byBucket.has(bucket)) byBucket.set(bucket, []);
        byBucket.get(bucket).push(c);
      });
      if (byBucket.size === 0) return [];
      return [...byBucket.entries()].map(([bucket, covs]) => {
        const peak = Math.max(...covs.map(c => num(c.amount)));
        return {
          ...common,
          id: "reco-" + (p.id || i) + "-" + bucket,
          category: bucket,
          covShort: withUnit(covs[0]?.category, (hasUnit(covs[0]?.category) ? money : kfmt)(boosted > 0 ? boosted : peak)),
        };
      });
    });
    return [...buildPlanItems(), ...recommended];
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
        // A plan covering one CI stage sits directly above an empty row for the other,
        // which reads as a hole in cover rather than a distinction between stages. Show
        // the empty stage only when neither is covered.
        const ciCovered = CI_ROWS.some(c => mine.some(it => it.category === c));
        rows = gapCats.filter(cat => {
          if (mine.some(it => it.category === cat)) return true;
          if (cat === "Others" || cat === "Child Savings") return false;              // no gap row for these
          if (CI_ROWS.includes(cat) && ciCovered) return false;                       // sibling stage is covered
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
        // keep the same bucket order as the Current view so the two modes read alike
        rows = [...byCat.entries()]
          .map(([category, plans]) => ({ category, plans }))
          .sort((a, b) => {
            const ia = EXISTING_PLAN_CATEGORIES.indexOf(a.category), ib = EXISTING_PLAN_CATEGORIES.indexOf(b.category);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          });
      }
      return { person, rows };
    }).filter(s => s.rows.length > 0);
  }, [items, insuredList, mode]);

  const LABEL_W = 170, PLOT_W = 620, PAD_R = 10, AXIS_H = 34, BOT_H = 32, LANE_H = 16, LANE_GAP = 4, ROW_PAD = 7, EMPTY_H = 20, SEC_H = 22;
  // extra band above a row whose plans carry projected values, so the marker labels
  // have somewhere to sit that is not on top of the bar above them
  const PROJ_H = 12;
  const planHasProj = (pl) => (pl.projections || []).length > 0;
  // each lane reserves its own label band, so two plans sharing a row never share ticks
  const laneOffset = (row, pi) => {
    let y = ROW_PAD;
    for (let i = 0; i < pi; i++) y += (planHasProj(row.plans[i]) ? PROJ_H : 0) + LANE_H + LANE_GAP;
    return y + (planHasProj(row.plans[pi]) ? PROJ_H : 0);
  };
  const span = Math.max(win.a1 - win.a0, 1);
  const x = (age) => LABEL_W + ((age - win.a0) / span) * PLOT_W;
  const rowH = (r) => r.plans.length
    ? r.plans.reduce((a, pl) => a + LANE_H + (planHasProj(pl) ? PROJ_H : 0), 0) + (r.plans.length - 1) * LANE_GAP + ROW_PAD * 2
    : EMPTY_H;
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

  // wheel zoom needs a non-passive listener; React's synthetic onWheel can't preventDefault.
  // Skipped entirely in printMode — a static embed shouldn't hijack page scroll.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || printMode) return;
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
  }, [items.length, printMode]);

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
  // White-on-fill is unreadable over a hatch or the light end of an accumulation gradient,
  // so savings bars label themselves with dark glyphs carrying a white halo instead.
  const haloLabel = (txt, g, y, dy) => {
    if (g.w <= 46) return null;
    const max = Math.floor(g.w / 5.1);
    const t = txt.length > max ? txt.slice(0, max - 1) + "…" : txt;
    const ty = y + (dy == null ? LANE_H / 2 + 3 : dy);
    return (
      <g pointerEvents="none">
        <text x={g.x0 + 5} y={ty} fontSize="8.5" fontWeight="700" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round">{t}</text>
        <text x={g.x0 + 5} y={ty} fontSize="8.5" fontWeight="700" fill="#3a1955">{t}</text>
      </g>
    );
  };
  // premium/contribution commitment: a small two-ended black bracket sitting in a thin
  // strip along the top of the bar (not through its middle) so it never covers the label.
  // A thin white halo behind the black stroke keeps it crisp against the darker fills.
  const premBracket = (p, y) => {
    if (p.premStart == null) return null;
    const g = clipX(p.premStart + p.offset, p.premEnd + p.offset);
    if (!g) return null;
    const topY = y + 2, capTop = y + 0.5, capBot = y + 5, x1 = g.x0, x2 = g.x0 + g.w;
    return (
      <g key="prem" pointerEvents="none">
        <line x1={x1} y1={topY} x2={x2} y2={topY} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
        <line x1={x1} y1={capTop} x2={x1} y2={capBot} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
        <line x1={x2} y1={capTop} x2={x2} y2={capBot} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity="0.55" />
        <line x1={x1} y1={topY} x2={x2} y2={topY} stroke="#0f172a" strokeWidth="2" />
        <line x1={x1} y1={capTop} x2={x1} y2={capBot} stroke="#0f172a" strokeWidth="2" />
        <line x1={x2} y1={capTop} x2={x2} y2={capBot} stroke="#0f172a" strokeWidth="2" />
      </g>
    );
  };

  // Savings vehicles get a hatch + accumulation gradient keyed to the insured's own colour,
  // so hue still says "who" while texture says "this is wealth, not protection".
  const savingsDefs = useMemo(() => {
    const seen = [...new Set(insuredList.map(p => p.color))];
    return seen.map(c => {
      const id = "sv" + c.replace("#", "");
      return (
        <React.Fragment key={id}>
          <linearGradient id={id + "g"} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={c} stopOpacity="0.45" />
            <stop offset="100%" stopColor={c} stopOpacity="1" />
          </linearGradient>
          <pattern id={id + "h"} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={c} opacity="0.28" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={c} strokeWidth="2.5" opacity="0.9" />
          </pattern>
        </React.Fragment>
      );
    });
  }, [insuredList]);
  const svFill = (color, kind) => "url(#sv" + color.replace("#", "") + (kind === "hatch" ? "h" : "g") + ")";

  // A deferred annuity is drawn as: hatched premium bar → thin deferral connector →
  // wedge that widens across the payout years (dividends building) → terminal-dividend diamond.
  const annuityShape = (p, y, opacity, common) => {
    const payC = p.payoutStart + p.offset, endC = p.end + p.offset;
    const premTo = p.premEnd != null ? Math.min(p.premEnd, p.payoutStart) : p.payoutStart;
    const gPrem = clipX(p.start + p.offset, premTo + p.offset);
    const gGap = clipX(premTo + p.offset, payC);
    const gPay = clipX(payC, endC);
    const midY = y + LANE_H / 2;
    return (
      <g key={p.id}>
        {gPrem && <rect x={gPrem.x0} y={y + LANE_H * 0.3} width={gPrem.w} height={LANE_H * 0.4} rx="2"
          fill={svFill(p.insured.color, "hatch")} opacity={opacity} {...common} />}
        {gGap && gGap.w > 2 && <line x1={gGap.x0} y1={midY} x2={gGap.x0 + gGap.w} y2={midY}
          stroke={p.insured.color} strokeWidth="1.5" strokeDasharray="2 3" opacity={opacity * 0.8} pointerEvents="none" />}
        {gPay && (
          <polygon
            points={`${gPay.x0},${midY - LANE_H * 0.18} ${gPay.x0 + gPay.w},${y} ${gPay.x0 + gPay.w},${y + LANE_H} ${gPay.x0},${midY + LANE_H * 0.18}`}
            fill={svFill(p.insured.color, "grad")} opacity={opacity} {...common} />
        )}
        {/* income starts here — the same marker SPK uses for its lump sum, since both are
            the moment money begins reaching the client */}
        {clipX(payC, payC) && (
          <g pointerEvents="none">
            <rect x={x(payC) - 4.5} y={midY - 4.5} width="9" height="9" transform={`rotate(45 ${x(payC)} ${midY})`}
              fill="#f59e0b" stroke="#fff" strokeWidth="1" />
            <text x={x(payC)} y={y - 2.5} textAnchor="middle" fontSize="7.5" fontWeight="700"
              stroke="#fff" strokeWidth="2.5" strokeLinejoin="round">{"payout from " + p.payoutStart}</text>
            <text x={x(payC)} y={y - 2.5} textAnchor="middle" fontSize="7.5" fill="#b45309" fontWeight="700">{"payout from " + p.payoutStart}</text>
          </g>
        )}
        {gPay && Math.abs(gPay.x0 + gPay.w - x(endC)) < 1 && (
          <g pointerEvents="none">
            <rect x={x(endC) - 4} y={midY - 4} width="8" height="8" transform={`rotate(45 ${x(endC)} ${midY})`}
              fill="#f59e0b" stroke="#fff" strokeWidth="1" />
            {p.terminalDividend > 0 && (<>
              <text x={x(endC)} y={y - 2.5} textAnchor="middle" fontSize="7.5" fontWeight="700" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round">{kfmt(p.terminalDividend)}</text>
              <text x={x(endC)} y={y - 2.5} textAnchor="middle" fontSize="7.5" fill="#b45309" fontWeight="700">{kfmt(p.terminalDividend)}</text>
            </>)}
          </g>
        )}
        {gPrem && haloLabel(p.label + (p.covShort ? " · " + p.covShort : ""), gPrem, y)}
        {gPay && gPay.w > 46 && haloLabel("payout", gPay, y)}
      </g>
    );
  };

  // A projected value is a point in time, so it reads as a tick across the row at the age
  // it lands on, labelled with the rate that produced it. Several rates usually share one
  // horizon, so a tick carries a range and the pinned card breaks it down in full.
  const projectionMarks = (p, laneY) => {
    if (!planHasProj(p)) return null;
    const byAge = new Map();
    (p.projections || []).forEach(pr => {
      const age = pr.age + p.offset;
      if (!byAge.has(age)) byAge.set(age, []);
      byAge.get(age).push(pr);
    });
    const top = laneY - PROJ_H + 1, bottom = laneY + LANE_H;
    let lastLabelX = -Infinity;
    return [...byAge.entries()].sort((a, b) => a[0] - b[0]).map(([age, entries]) => {
      if (age < win.a0 || age > win.a1) return null;
      const cx = x(age);
      const vals = entries.map(e => e.projected);
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const text = entries.length === 1
        ? entries[0].rate + "% · " + kfmt(hi)
        : kfmt(lo) + "–" + kfmt(hi);
      // drop a label rather than let two overlap; the tick itself always stays
      const room = cx - lastLabelX > 54;
      if (room) lastLabelX = cx;
      return (
        <g key={"pr" + age} pointerEvents="none">
          <line x1={cx} y1={top} x2={cx} y2={bottom} stroke="#0f172a" strokeWidth="1" strokeDasharray="2 2" opacity="0.55" />
          <polygon points={`${cx - 3},${top} ${cx + 3},${top} ${cx},${top + 4}`} fill="#0f172a" opacity="0.75" />
          {room && (<>
            <text x={cx} y={laneY - 3} textAnchor="middle" fontSize="7.5" fontWeight="700"
              stroke="#fff" strokeWidth="2.5" strokeLinejoin="round">{text}</text>
            <text x={cx} y={laneY - 3} textAnchor="middle" fontSize="7.5" fill="#0f172a" fontWeight="700">{text}</text>
          </>)}
        </g>
      );
    });
  };

  const zoomed = win.a0 > 0 || win.a1 < TIMELINE_MAX_AGE;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="text-sm text-slate-500">Coverage span on the client's age axis{clientAge ? ` — client is ${clientAge} today` : ""}</div>
        {!printMode && (
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
        )}
      </div>
      {items.length === 0 && mode === "recommended" ? (
        <div className="p-8 text-center text-slate-400 text-sm">No recommended plans selected yet — tick plans to include in the Recommended Plans step.</div>
      ) : sections.length === 0 ? (
        <div className="p-8 text-center text-slate-400 text-sm">No existing plans added yet — add them in the Current Coverage step.</div>
      ) : (
        <>
        <svg ref={svgRef} viewBox={`0 0 ${LABEL_W + PLOT_W + PAD_R} ${totalH}`} className="w-full" role="img" aria-label={`${mode === "current" ? "Current" : "Recommended"} coverage timeline`}>
          <defs>{savingsDefs}</defs>
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
                        const y = y0 + laneOffset(row, pi);
                        const cs = p.start + p.offset, ce = p.end + p.offset;
                        const active = hover?.item.id === p.id || selected?.id === p.id;
                        const common = {
                          style: { cursor: "pointer" },
                          onMouseMove: (e) => showHover(e, p),
                          onMouseLeave: () => setHover(null),
                          onClick: () => setSelected(s => s?.id === p.id ? null : p),
                        };
                        // in Recommended mode, current-origin bars are muted with a dashed
                        // outline so they read as "already in force" behind the proposal
                        const isMutedCurrent = mode === "recommended" && p.origin === "current";
                        // a lapsed or surrendered policy stays visible as history, but reads as
                        // grey and washed out so it can never be mistaken for live cover
                        const dead = statusIsDead(p.status);
                        const opacity = dead ? (active ? 0.6 : 0.38) : active ? 1 : isMutedCurrent ? 0.5 : mode === "current" ? 0.65 : 0.85;
                        const stroke = selected?.id === p.id ? "#0f172a" : dead ? "#94a3b8" : (isMutedCurrent ? "#64748b" : "none");
                        const dash = dead ? "4 3" : isMutedCurrent ? "3 2" : undefined;
                        const fill = dead ? "#94a3b8" : p.savings ? svFill(p.insured.color, "grad") : p.insured.color;
                        if (p.payoutStart != null && p.payoutStart > p.start && !dead) {
                          return annuityShape(p, y, opacity, common);
                        }
                        // SPK: accumulate to 60, lump sum at 60, then a slimmer fixed annuity
                        if (p.lumpSumAge != null && !dead) {
                          const cutC = p.lumpSumAge + p.offset;
                          const gA = clipX(cs, cutC), gB = clipX(cutC, ce);
                          const midY = y + LANE_H / 2;
                          return (
                            <g key={p.id}>
                              {gA && <rect x={gA.x0} y={y} width={gA.w} height={LANE_H} rx="4" fill={fill} opacity={opacity} stroke={stroke} strokeWidth="1.5" {...common} />}
                              {gB && <rect x={gB.x0} y={midY - LANE_H * 0.22} width={gB.w} height={LANE_H * 0.44} rx="2" fill={fill} opacity={opacity * 0.9} stroke={stroke} strokeWidth="1.5" {...common} />}
                              {clipX(cutC, cutC) && (
                                <rect x={x(cutC) - 4.5} y={midY - 4.5} width="9" height="9" transform={`rotate(45 ${x(cutC)} ${midY})`}
                                  fill="#f59e0b" stroke="#fff" strokeWidth="1" pointerEvents="none" />
                              )}
                              {gA && haloLabel(p.label + (p.covShort ? " · " + p.covShort : ""), gA, y)}
                              {gB && gB.w > 60 && haloLabel(p.spkAnnuityMonthly > 0 ? money(p.spkAnnuityMonthly) + "/mo" : "annuity", gB, y)}
                              {premBracket(p, y)}
                              {projectionMarks(p, y)}
                            </g>
                          );
                        }
                        if (p.stepAge != null) {
                          const stepC = p.stepAge + p.offset;
                          const g1 = clipX(cs, stepC), g2 = clipX(stepC, ce);
                          return (
                            <g key={p.id}>
                              {g1 && <rect x={g1.x0} y={y} width={g1.w} height={LANE_H} rx="3" fill={fill} opacity={opacity} stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} {...common} />}
                              {g2 && <rect x={g2.x0} y={y + LANE_H * 0.25} width={g2.w} height={LANE_H * 0.55} rx="3" fill={fill} opacity={opacity * 0.65} stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} {...common} />}
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
                            <rect x={g.x0} y={y} width={g.w} height={LANE_H} rx="4" fill={fill} opacity={opacity} stroke={stroke} strokeWidth="1.5" strokeDasharray={dash} {...common} />
                            {(p.savings && !dead ? haloLabel : barLabel)(p.label + (p.covShort ? " · " + p.covShort : ""), g, y)}
                            {premBracket(p, y)}
                            {projectionMarks(p, y)}
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
          <span className="inline-flex items-center gap-1">
            <svg width="26" height="12"><defs><linearGradient id="lgsv" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#51037c" stopOpacity="0.45" /><stop offset="100%" stopColor="#51037c" /></linearGradient></defs><rect x="0" y="1.5" width="26" height="9" rx="2" fill="url(#lgsv)" /></svg>
            savings / wealth plan
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="30" height="12"><rect x="0" y="4" width="9" height="4" rx="1" fill="#51037c" opacity="0.5" /><line x1="9" y1="6" x2="14" y2="6" stroke="#51037c" strokeWidth="1.5" strokeDasharray="2 2" /><polygon points="14,4.5 24,1 24,11 14,7.5" fill="url(#lgsv)" /><rect x="24" y="3" width="6" height="6" transform="rotate(45 27 6)" fill="#f59e0b" /></svg>
            annuity: premiums → payout → lump sum / terminal dividend
          </span>
          <span className="inline-flex items-center gap-1">
            <svg width="20" height="12"><rect x="1" y="1.5" width="18" height="9" rx="2" fill="#94a3b8" opacity="0.38" stroke="#94a3b8" strokeDasharray="4 3" /></svg>
            lapsed / surrendered
          </span>
          {items.some(it => it.premStart != null) && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="24" height="10"><line x1="2" y1="5" x2="22" y2="5" stroke="#0f172a" strokeWidth="2" /><line x1="2" y1="1" x2="2" y2="9" stroke="#0f172a" strokeWidth="2" /><line x1="22" y1="1" x2="22" y2="9" stroke="#0f172a" strokeWidth="2" /></svg>
              premium / contribution period
            </span>
          )}
          {items.some(it => (it.projections || []).length > 0) && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="12"><line x1="10" y1="2" x2="10" y2="12" stroke="#0f172a" strokeWidth="1" strokeDasharray="2 2" opacity="0.55" /><polygon points="7,2 13,2 10,6" fill="#0f172a" opacity="0.75" /></svg>
              projected value at that age
            </span>
          )}
          {mode === "current" && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="12"><rect x="1" y="1.5" width="18" height="9" rx="3" fill="none" stroke="#cbd5e1" strokeDasharray="4 3" /></svg>
              not covered yet
            </span>
          )}
          {mode === "recommended" && items.some(it => it.origin === "current") && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="20" height="12"><rect x="1" y="1.5" width="18" height="9" rx="3" fill="#cbd5e1" stroke="#64748b" strokeDasharray="3 2" opacity="0.7" /></svg>
              current plan (in force) · solid = recommended
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
            {(selected.projections || []).length > 0 && (() => {
              // one row per horizon, one column per rate — reading across a row answers
              // "what is this worth at that age", reading down a column answers
              // "what does this rate do over time"
              const rates = [...new Set(selected.projections.map(pr => pr.rate))].sort((a, b) => a - b);
              const years = [...new Set(selected.projections.map(pr => pr.years))].sort((a, b) => a - b);
              const at = (yr, rate) => selected.projections.find(pr => pr.years === yr && pr.rate === rate);
              return (
                <div className="mt-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Projected value</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <thead>
                        <tr>
                          <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1 px-2 bg-slate-50 border-b border-slate-200">Year · age</th>
                          {rates.map(r => (
                            <th key={r} className="text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1 px-2 bg-slate-50 border-b border-slate-200">{r}% p.a.</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {years.map(yr => {
                          const any = selected.projections.find(pr => pr.years === yr);
                          return (
                            <tr key={yr}>
                              <td className="py-1.5 px-2 border-b border-slate-100">
                                <b>{any.year}</b> — age {any.age}
                                <span className="text-slate-400"> · in {yr} {yr === 1 ? "yr" : "yrs"}</span>
                              </td>
                              {rates.map(r => {
                                const cell = at(yr, r);
                                return <td key={r} className="py-1.5 px-2 border-b border-slate-100 text-right tabular-nums">{cell ? money(cell.projected) : "—"}</td>;
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Projections grow the current value plus ongoing contributions at the stated rate; they are illustrations, not guarantees.</p>
                </div>
              );
            })()}
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
  const [view, setView] = useState("list"); // list | edit | report | review
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
  const displayName = (name, fallback) => (privacy ? (maskedName(name) || fallback) : (name || fallback));

  const client = clients.find(c => c.id === activeId) || null;
  const d = useMemo(() => client ? compute(client) : null, [client]);
  // everyone a plan can be quoted for — one plan-quotation table per entry in step 6
  const quoteTargets = useMemo(() => client ? [
    { id: "self", name: client.name || "Client", relationship: "", age: num(calcAge(client.dob)) },
    ...(client.dependents || []).map(dep => ({ id: dep.id, name: dep.name || "Dependent", relationship: dep.relationship || "", age: num(calcAge(dep.dob)) })),
  ] : [], [client]);

  // Autosave used to fire a full-record write on every keystroke. Batching rapid edits
  // and writing once after a short pause cuts that down drastically — especially for
  // clients carrying uploaded plan images, where every write re-sends those bytes too.
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);
  const flushPendingSave = () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const pending = pendingSaveRef.current;
    if (pending) {
      pendingSaveRef.current = null;
      saveClient(pending).catch(e => toast.error("Save failed: " + (e?.message || e)));
    }
  };
  useEffect(() => () => flushPendingSave(), []); // flush on unmount so a last edit is never dropped

  const update = (patch) => {
    setClients(prev => {
      const at = Date.now();
      const next = prev.map(c => {
        if (c.id !== activeId) return c;
        const merged = { ...c, ...patch, updated: at };
        const stamps = sectionStamps(c, merged, at);
        return Object.keys(stamps).length
          ? { ...merged, sectionUpdated: { ...(c.sectionUpdated || {}), ...stamps } }
          : merged;
      });
      const updated = next.find(c => c.id === activeId);
      if (updated) {
        pendingSaveRef.current = updated;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(flushPendingSave, 1000);
      }
      return next;
    });
  };
  const updateDeep = (key, patch) => update({ [key]: { ...client[key], ...patch } });

  const persist = async () => {
    if (!client) return;
    // an explicit save always writes the freshest client state itself, so just drop
    // the pending debounced save rather than firing it and then saving again right after
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    pendingSaveRef.current = null;
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
  const [draftingReview, setDraftingReview] = useState(false);
  const [reviewDraftError, setReviewDraftError] = useState("");

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

  // Turns the advisor's raw meeting notes into the three review-report narrative fields.
  // Shares the draft-narrative edge function with the recommendation drafter; the older
  // deployment of that function only passes through exec/recoIntro/actionPlan, so the
  // review keys fall back to those positionally and the feature works either way.
  const draftReviewFromNotes = async () => {
    if (!client || !d) return;
    const notes = (client.review?.meetingNotes || "").trim();
    if (!notes) { setReviewDraftError("Paste your meeting notes first — the draft is written from them."); return; }
    setDraftingReview(true);
    setReviewDraftError("");
    try {
      const { data, error } = await supabase.functions.invoke('draft-narrative', {
        body: { prompt: buildReviewPrompt(client, d, notes) }
      });
      if (error) {
        console.error('Edge function error:', error);
        let message = error.message;
        try {
          const details = await error.context?.json?.();
          if (details?.details) message = `${message}: ${details.details}`;
          else if (details?.error) message = `${message}: ${details.error}`;
        } catch (_detailsError) {
          // keep the SDK's message if the response body can't be read
        }
        throw new Error(message);
      }
      // The deployed edge function returns a fixed exec/recoIntro/actionPlan triple and
      // drops any other key, filling the ones the model omitted with "" — so an empty
      // string means "not returned" here and the semantic names can only win when they
      // actually carry text.
      const firstText = (...vals) => vals.find(v => typeof v === "string" && v.trim()) || "";
      const exec = firstText(data?.exec);
      const keyPoints = firstText(data?.keyPoints, data?.recoIntro);
      const whatsNext = firstText(data?.whatsNext, data?.actionPlan);
      if (!exec && !keyPoints && !whatsNext) throw new Error(data?.error || "No content returned");
      updateDeep("review", { exec, keyPoints, whatsNext });
      toast.success("Review draft generated — read it through before sending");
    } catch (e) {
      console.error(e);
      setReviewDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftingReview(false);
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
            <button onClick={togglePrivacy} title={privacy ? "Names are masked — tap to show them in full" : "Showing full names — tap to mask them"} className={"text-sm px-3 py-2 rounded-lg border " + (privacy ? "bg-purple-900 text-white border-purple-900" : "border-slate-300 text-slate-600 hover:bg-slate-50 bg-white")}>
              {privacy ? "🔒 Names masked" : "👁 Full names"}
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
              placeholder="Search by client, dependent, occupation or policy number…"
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
        {/* Match against the real name/occupation even while privacy mode masks the display */}
        {(() => {
          const q = clientQuery.trim();
          const visible = q
            ? clients.map(c => ({ c, m: clientSearchMatch(c, q) })).filter(r => r.m.ok).map(r => ({ ...r.c, _match: r.m }))
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
                {/* the whole-record date moves on any edit, so the fact-find figures carry
                    their own — a dash means not touched since this became tracked */}
                <div className="text-xs text-slate-400 mt-0.5">
                  {Object.entries(SECTION_FIELDS).map(([key, { label }], i) => (
                    <span key={key} title={label === "Income" ? "Income Allocation last updated" : "Assets & Liabilities last updated"}>
                      {i > 0 ? " · " : ""}{label} <span className={c.sectionUpdated?.[key] ? "text-slate-500 font-medium" : "text-slate-300"}>{shortDate(c.sectionUpdated?.[key])}</span>
                    </span>
                  ))}
                </div>
                {c._match?.kind === "dependent" && (
                  <div className="text-xs text-purple-700 mt-0.5">Matched {c._match.relationship ? c._match.relationship.toLowerCase() : "dependent"}: <b>{displayName(c._match.name, "Dependent")}</b></div>
                )}
                {c._match?.kind === "policy" && (
                  <div className="text-xs text-purple-700 mt-0.5">Matched policy <b>{c._match.no}</b>{c._match.what ? " · " + c._match.what : ""}</div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setActiveId(c.id); setView("edit"); setStep(0); }} className="text-sm px-3 py-1.5 rounded-lg border border-purple-700 text-purple-800 hover:bg-purple-50">Open</button>
                <button onClick={() => { setActiveId(c.id); setView("report"); }} className="text-sm px-3 py-1.5 rounded-lg bg-purple-700 text-white hover:bg-purple-800">Report</button>
                <button onClick={() => { setActiveId(c.id); setView("review"); }} title="Annual review report" className="text-sm px-3 py-1.5 rounded-lg border border-purple-300 text-purple-800 hover:bg-purple-50">Review</button>
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
    // a browsing client gets a menu of plans, not a costed proposal: no tiers,
    // no subtotals, no budget guideline — see reportMode on the client record
    const optionsMode = client.reportMode === "options";
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
          /* benefit tables inside a plan explanation read as supporting detail, so they
             sit narrower than the page and set tighter than the report's main tables */
          .rpt table.compact{width:86%;font-size:11.5px;margin:8px 0}
          .rpt table.compact th{padding:4px 7px;font-size:11px}
          .rpt table.compact td{padding:4px 7px}
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
            .sheet{box-shadow:none!important;margin:0!important;width:100%!important;padding:14mm 16mm 8mm!important}
            /* page numbers in the bottom margin. Browsers that don't implement @page margin
               boxes simply leave the margin empty — nothing else shifts. The cover carries
               no number. */
            @page{size:A4;margin:0 0 10mm;@bottom-right{content:counter(page);font-family:'Source Sans 3',system-ui,sans-serif;font-size:9pt;color:#64748b;margin-right:16mm}}
            @page:first{@bottom-right{content:""}}
            /* contents links print as ordinary text, not as blue underlined links */
            .rpt a{color:inherit!important;text-decoration:none!important}
            .rpt a.planlink{border-bottom:none!important}
          }
          /* a plan name in the quotation table jumps to its explanation — dotted underline
             on screen so it reads as clickable, nothing at all on paper */
          .rpt a.planlink{border-bottom:1px dotted #a78bfa}
          /* a heading jumped to from the contents shouldn't hide under the sticky toolbar */
          .rpt h2,.rpt h3{scroll-margin-top:70px}
          .rpt a[href^="#"]:hover{text-decoration:underline!important}
        `}</style>
        <div className="no-print sticky top-0 z-10 text-white px-6 py-3 flex items-center justify-between" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 100%)" }}>
          <div className="text-sm"><span className="font-semibold">{displayName(client.name, "Unnamed")}</span> — report preview{optionsMode && <span className="ml-3 text-[11px] bg-amber-300 text-amber-950 font-semibold px-2 py-1 rounded" title="Set on the Recommended Plans step. Tier labels, subtotals and the 4-3-2-1 budget check are hidden in this mode.">PLAN OPTIONS MODE — tier labels &amp; totals hidden</span>}</div>
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
              { num: "1.", title: "Executive Summary", id: "sec-exec", sub: [
                ...(client.sections.hierarchy ? [{ label: "The Hierarchy of Needs in Financial Planning", id: "sec-hierarchy" }] : []),
                ...(client.sections.education ? EDU_SECTIONS.slice(1).map(s => ({ label: s.title, id: "sec-edu-" + s.id })) : []),
              ] },
              { num: "2.", title: "Your Finances", id: "sec-finances", sub: [
                { label: "Net Worth", id: "sec-finances" }, { label: "2.1 Cash Flow Summary", id: "sec-cashflow" },
                ...(client.sections.allocation ? [{ label: "4-3-2-1 Allocation", id: "sec-allocation" }] : []),
                ...(client.sections.ratios ? [{ label: "2.2 Financial Ratio Analysis", id: "sec-ratios" }] : []),
              ] },
              { num: "3.", title: "Your Concerns & Objectives", id: "sec-objectives", sub: [
                { label: "3.1 Income Replacement", id: "sec-income-replacement" }, { label: "3.2 Retirement Planning", id: "sec-retirement" },
                ...(hasOther ? [{ label: "3.3 Other Objectives", id: "sec-other-objectives" }] : []),
              ] },
              { num: "4.", title: "Recommendation", id: "sec-recommendation", sub: [
                ...(n.actionPlan ? [{ label: "Action Plan", id: "sec-action-plan" }] : []),
                { label: optionsMode ? "4.1 Plan Options" : "4.1 Recommended Plans", id: "sec-plans" },
              ] },
              ...(d.selected.length ? [{ num: "5.", title: "Explanation of Plan Options", id: "sec-explanations",
                sub: uniqueExplanations(d.selected).map((p, i) => ({ label: (i + 1) + ". " + (PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label), id: planAnchor(p) })) }] : []),
              { num: d.selected.length ? "6." : "5.", title: "Conclusion", id: "sec-conclusion",
                sub: [{ label: "Client Acknowledgement", id: "sec-acknowledgement" }] },
            ];
            return <TableOfContents entries={entries} />;
          })()}

          <div className="pagebreak" />
          <h2 id="sec-exec">1. Executive Summary</h2>
          {n.exec ? para(n.exec) : <p className="italic text-slate-400">No executive summary yet — draft one in the Narrative step.</p>}
          {client.sections.hierarchy && (<><h3 id="sec-hierarchy">The Hierarchy of Needs in Financial Planning</h3>{para(EDU_SECTIONS[0].body)}<div style={{ breakInside: "avoid", margin: "10px 0 18px" }}><HierarchyPyramid title={false} /></div></>)}
          {client.sections.education && EDU_SECTIONS.slice(1).map(s => (<div key={s.id}><h3 id={"sec-edu-" + s.id}>{s.title}</h3>{para(s.body)}</div>))}

          <div className="pagebreak" />
          <h2 id="sec-finances">2. Your Finances</h2>
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
          <h3 id="sec-cashflow">2.1 Your Cash Flow Summary</h3>
          <table><tbody>
            <tr><td>Net Income (take-home)</td><td className="tnum">{money(d.net)} / month</td></tr>
            <tr><td>Total Expenses</td><td className="tnum">({money(d.totalExpenses)}) / month</td></tr>
            <tr><td className="font-bold">{d.surplus >= 0 ? "Surplus" : "Shortfall"}</td><td className={"tnum font-bold " + (d.surplus >= 0 ? "text-purple-900" : "text-red-700")}>{money(Math.abs(d.surplus))} / month</td></tr>
          </tbody></table>
          {client.sections.allocation && (<>
            <h3 id="sec-allocation">The 4-3-2-1 Money Management Framework</h3>
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
            <h3 id="sec-ratios">2.2 Financial Ratio Analysis</h3>
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
          <h2 id="sec-objectives">3. Your Concerns &amp; Objectives</h2>
          {calcAge(client.dob) !== "" && (
            <div className="my-4" style={{ breakInside: "avoid" }}>
              <LifeTimeline client={client} />
              <p className="text-xs text-slate-500 mt-1" style={{ textAlign: "center" }}>Your planning horizon at a glance — where you are today, your target retirement age, your dependents, and the years beyond. Green marks show when each child reaches 18 and 21.</p>
            </div>
          )}
          <h3 id="sec-income-replacement">3.1 Income Replacement</h3>
          <p className="mb-2">To provide an income of {money(d.irMonthly)} per month in the event of premature death or total permanent disability, for {d.irYears} years from today (potential income of {money(d.potentialIncome)}).</p>
          <table>
            <thead><tr><th>Need</th><th>Guideline</th><th className="tnum">Benchmark</th><th className="tnum">Current</th><th className="tnum">Shortfall</th></tr></thead>
            <tbody>{d.irRows.map(r => (
              <tr key={r.name}><td>{r.name}</td><td>{r.guideline}</td><td className="tnum">{money(r.bench)}</td><td className="tnum">{money(r.current)}</td><td className={"tnum " + (r.shortfall > 0 ? "text-red-700 font-semibold" : "text-purple-800")}>{money(r.shortfall)}</td></tr>
            ))}</tbody>
          </table>
          <p className="text-xs text-slate-500 mb-4">Without adequate coverage for death, disability and sickness: (i) your SPK and other income might not be sufficient to support family expenses; (ii) you might have to downgrade to a less desired lifestyle.</p>
          <h3 id="sec-retirement">3.2 Retirement Planning</h3>
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
                <td className="tnum">{money(d.spkLumpSum)}</td>
                <td className="tnum">—</td>
              </tr>
              <tr>
                <td>SPK Annuity — Employer{d.spkMonthly > 0 ? " (" + money(d.spkMonthly) + "/mo × " + client.retirement.spkAnnuityYears + " yrs)" : ""}</td>
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
            <h3 id="sec-other-objectives">3.3 Other Objectives</h3>
            <table>
              <thead><tr><th>Objective</th><th>Remarks</th><th className="tnum">Target</th><th className="tnum">Horizon</th><th className="tnum">Indicative saving</th></tr></thead>
              <tbody>{(client.otherObjectives || []).filter(o => o.name || num(o.target) > 0).map(o => (
                <tr key={o.id}><td>{o.name}</td><td>{o.note}</td><td className="tnum">{money(num(o.target))}</td><td className="tnum">{num(o.years) > 0 ? o.years + " yrs" : "—"}</td><td className="tnum">{num(o.target) > 0 && num(o.years) > 0 ? money(num(o.target) / (num(o.years) * 12)) + "/mo" : "—"}</td></tr>
              ))}</tbody>
            </table>
          </>)}

          <div className="pagebreak" />
          <h2 id="sec-recommendation">4. Recommendation</h2>
          {n.recoIntro ? para(n.recoIntro) : <p className="italic text-slate-400">No recommendation narrative yet — draft one in the Narrative step.</p>}
          {n.actionPlan && (<><h3 id="sec-action-plan">Action Plan</h3>{paraAction(n.actionPlan)}</>)}

          <h3 id="sec-plans">{optionsMode ? "4.1 Plan Options" : "4.1 Recommended Plans"}</h3>
          <p className="mb-2">{optionsMode
            ? "The plans set out below are options for your consideration. They are presented so you can compare what each one covers and what it costs, without any commitment — we can narrow them down together once you have had a chance to look through."
            : "The main purpose of these plan recommendations is to prioritise protecting your income — ensuring financial security for you and your family — and to prepare funds for retirement, including addressing potential income loss due to disability or sickness."}</p>
          <table><tbody>
            <tr><td>Emergency fund needed (3–6 months of expenses)</td><td className="tnum">{money(d.ef3)} – {money(d.ef6)}</td></tr>
            <tr><td>Amount saved</td><td className="tnum">{money(d.cash)}</td></tr>
            <tr><td className="font-semibold">{d.cash >= d.ef3 ? "Within target" : "Shortfall to 3-month target"}</td><td className={"tnum font-semibold " + (d.cash >= d.ef3 ? "text-purple-900" : "text-red-700")}>{money(Math.max(0, d.ef3 - d.cash))}</td></tr>
          </tbody></table>
          <QuotationTables groups={d.insuredGroups} grandMonthly={d.premMonthly} grandAnnual={d.premAnnual} optionsMode={optionsMode} />
          {/* the 4-3-2-1 guideline measures a committed premium against income, which
              only means something once these are actual recommendations */}
          {!optionsMode && d.net > 0 && (() => {
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
          {optionsMode
            ? <p className="text-xs text-slate-500 mt-2">The plans above are presented as options for discussion. Premiums shown are per plan and are not a total commitment. Returns are based on the Projected Investment Rate of Return on AIA's Participating Fund at 4.25% p.a. unless stated otherwise.</p>
            : <p className="text-xs text-slate-500 mt-2"><b>Recommended</b> plans fit within the indicated budget of {client.budgetNote}. <b>Worth considering</b> are additional options currently outside that budget. <b>Future options</b> are plans to explore as your finances allow or as priorities evolve. Returns are based on the Projected Investment Rate of Return on AIA's Participating Fund at 4.25% p.a. unless stated otherwise.</p>}

          {d.selected.length > 0 && (<><div className="pagebreak" /><h2 id="sec-explanations">5. Explanation of Plan Options</h2>
            {uniqueExplanations(d.selected).map((p, i) => {
              const parts = PLAN_LIBRARY[p.key] ? renderPlanBody(PLAN_LIBRARY[p.key].body) : { main: null, limitations: null };
              return (
                <div key={p.key} style={{ breakBefore: i > 0 ? "page" : "auto" }}>
                  <h3 id={planAnchor(p)}>{i + 1}. {PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label}</h3>
                  {parts.main}
                  {PLAN_LIBRARY[p.key]?.tables && <PlanBodyTables tables={PLAN_LIBRARY[p.key].tables} note={PLAN_LIBRARY[p.key].tablesNote} riders={p.riders} />}
                  {(p.planImages||[]).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {p.planImages.map(img => (
                        <div key={img.id} style={{ breakInside: "avoid", marginBottom: 16, textAlign: "center" }}>
                          <PlanImage img={img} alt={img.caption||img.name} style={{ maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 6, display: "inline-block" }} />
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
          <h2 id="sec-conclusion">{d.selected.length > 0 ? "6" : "5"}. Conclusion</h2>
          {para("The above recommendation is based on my best knowledge and professional advice, as if I were in your shoes. All premiums and coverage amounts can be adjusted to your needs. The budget set aside for the above objectives should be around 20–30% of individual income, to encourage progress toward future goals while still enjoying the lifestyle you want during your working years.\n\nThe plan is designed to encourage you to accumulate as much as you can to reduce future shortfalls, and to keep you protected along the course of your joyful life.\n\nIt is advised that we meet at least once a year to review your financial standing and track the progress of your financial plan.")}
          <h3 id="sec-acknowledgement">Client Acknowledgement</h3>
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

  // ----- annual review report view -----
  if (view === "review") {
    // a browsing client gets a menu of plans, not a costed proposal: no tiers,
    // no subtotals, no budget guideline — see reportMode on the client record
    const optionsMode = client.reportMode === "options";
    const rv = client.review || { exec: "", keyPoints: "", financialHealthDone: false, contingencyNote: "", whatsNext: "" };
    const para = (t) => (t || "").split(/\n\n+/).filter(Boolean).map((p, i) => <p key={i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, whiteSpace: "pre-line" }}>{p}</p>);
    // key points / action items: bold the lead phrase before the em-dash or colon
    const paraLead = (t, sep) => (t || "").split(/\n+/).filter(s => s.trim()).map((p, i) => {
      const m = sep === "num"
        ? p.match(/^(\d+[.)]\s*)([^:\n]{2,90}):\s*([\s\S]*)$/)
        : p.match(/^([^—\n]{2,60})—\s*([\s\S]*)$/);
      if (m) return sep === "num" ? (
        <p key={i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, whiteSpace: "pre-line" }}>
          <b style={{ color: "#3a1955" }}>{m[1]}{m[2]}:</b> {m[3]}
        </p>
      ) : (
        <p key={i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, whiteSpace: "pre-line" }}>
          <b style={{ color: "#3a1955" }}>{m[1].trim()} —</b> {m[2]}
        </p>
      );
      return <p key={i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, whiteSpace: "pre-line" }}>{p}</p>;
    });
    const doPrintPdf = () => {
      const prev = document.title;
      document.title = "GoodLife-Review-" + (client.name || "Client").trim().replace(/\s+/g, "-");
      window.print();
      setTimeout(() => { document.title = prev; }, 1000);
    };
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
          if (trimmed === "Plan Limitations:" || trimmed === "Plan Limitation:") return;
          limitGroup.push(trimmed);
        } else if (trimmed.startsWith("•")) {
          bulletGroup.push(trimmed);
        } else if (trimmed === "Plan Limitations:" || trimmed === "Plan Limitation:") {
          flushBullets();
        } else {
          flushBullets();
          mainEls.push(<p key={"p" + i} style={{ textAlign: "justify", lineHeight: 1.65, marginBottom: 12, fontSize: 13.5, color: "#1f2937" }}>{trimmed}</p>);
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
          /* benefit tables inside a plan explanation read as supporting detail, so they
             sit narrower than the page and set tighter than the report's main tables */
          .rpt table.compact{width:86%;font-size:11.5px;margin:8px 0}
          .rpt table.compact th{padding:4px 7px;font-size:11px}
          .rpt table.compact td{padding:4px 7px}
          .rpt p{text-align:justify;line-height:1.65;margin:0 0 12px}
          .rpt .tnum{text-align:right;font-variant-numeric:tabular-nums}
          .pagebreak{break-before:page}
          .rpt svg{break-inside:avoid}
          @media print{
            body{background:#fff!important}
            .no-print{display:none!important}
            #lovable-badge,a[href*="lovable.dev"],a[href*="lovable.app"],[id*="lovable" i],div[class*="lovable" i]{display:none!important}
            *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
            .sheet{box-shadow:none!important;margin:0!important;width:100%!important;padding:14mm 16mm 8mm!important}
            /* page numbers in the bottom margin. Browsers that don't implement @page margin
               boxes simply leave the margin empty — nothing else shifts. The cover carries
               no number. */
            @page{size:A4;margin:0 0 10mm;@bottom-right{content:counter(page);font-family:'Source Sans 3',system-ui,sans-serif;font-size:9pt;color:#64748b;margin-right:16mm}}
            @page:first{@bottom-right{content:""}}
            /* contents links print as ordinary text, not as blue underlined links */
            .rpt a{color:inherit!important;text-decoration:none!important}
            .rpt a.planlink{border-bottom:none!important}
          }
          /* a plan name in the quotation table jumps to its explanation — dotted underline
             on screen so it reads as clickable, nothing at all on paper */
          .rpt a.planlink{border-bottom:1px dotted #a78bfa}
          /* a heading jumped to from the contents shouldn't hide under the sticky toolbar */
          .rpt h2,.rpt h3{scroll-margin-top:70px}
          .rpt a[href^="#"]:hover{text-decoration:underline!important}
        `}</style>
        <div className="no-print sticky top-0 z-10 text-white px-6 py-3 flex items-center justify-between" style={{ background: "linear-gradient(120deg, #3a1955 0%, #51037c 100%)" }}>
          <div className="text-sm"><span className="font-semibold">{displayName(client.name, "Unnamed")}</span> — annual review preview{optionsMode && <span className="ml-3 text-[11px] bg-amber-300 text-amber-950 font-semibold px-2 py-1 rounded" title="Set on the Recommended Plans step. Tier labels, subtotals and the 4-3-2-1 budget check are hidden in this mode.">PLAN OPTIONS MODE — tier labels &amp; totals hidden</span>}</div>
          <div className="flex gap-2">
            <button onClick={() => setView("edit")} className="text-sm px-3 py-1.5 rounded-lg border border-purple-400 hover:bg-purple-900">← Back to editing</button>
            <button onClick={doPrintPdf} className="text-sm px-3 py-1.5 rounded-lg bg-white text-purple-900 font-semibold hover:bg-purple-100">⬇ Save as PDF</button>
          </div>
        </div>
        <div id="review-content" className="rpt sheet bg-white max-w-[210mm] mx-auto my-6 shadow-xl" style={{ padding: "18mm 18mm" }}>
          {/* cover */}
          <div style={{ minHeight: "252mm", display: "flex", flexDirection: "column" }}>
            <div className="text-center" style={{ paddingTop: 56 }}>
              <div style={{ display: "inline-block", border: "2.5px solid #475569", padding: "8px 32px", background: "#fff" }}>
                <span style={{ color: "#dc2626", fontWeight: 800, fontSize: 30, letterSpacing: "0.04em", fontFamily: "Arial, Helvetica, sans-serif" }}>CONFIDENTIAL</span>
              </div>
            </div>
            <div className="text-center" style={{ marginTop: 90 }}>
              <div className="serif text-2xl italic text-slate-600">Financial Planning &amp; Insurance Summary</div>
              <div className="serif text-xl italic text-slate-600 mb-4">prepared for</div>
              <h1 className="serif text-4xl font-bold text-purple-900 uppercase tracking-wide">{client.name || "—"}</h1>
              <div className="text-sm text-slate-500 mt-3">Overview of current planning based on our latest meeting</div>
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
            const entries = [
              { title: "Executive Summary", id: "rv-exec", sub: [
                { label: "Key Points", id: "rv-keypoints" },
                ...(client.sections.hierarchy ? [{ label: "The Hierarchy of Needs in Financial Planning", id: "rv-hierarchy" }] : []),
              ] },
              { title: "Current Plans & Coverage", id: "rv-current-plans",
                sub: currentPremiumSplit(client).total > 0 ? [{ label: "Premium Commitment against the 4-3-2-1 Rule", id: "rv-premium-budget" }] : [] },
              { title: "Current Financial Health", id: "rv-health",
                sub: (client.history || []).filter(h => h.date).length >= 2 ? [{ label: "Your Progress Since Previous Reviews", id: "rv-progress" }] : [] },
              { title: "Overview of Plans", id: "rv-overview", sub: [] },
              { title: "Recommendations", id: "rv-recommendations", sub: [
                ...(rv.contingencyNote ? [{ label: "Contingency Planning", id: "rv-contingency" }] : []),
                { label: optionsMode ? "Plan Options" : "4-3-2-1 Recommended Plans", id: "rv-plans" },
              ] },
              ...(d.selected.length ? [{ title: "Explanation of Recommendations", id: "rv-explanations",
                sub: uniqueExplanations(d.selected).map((p, i) => ({ label: (i + 1) + ". " + (PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label), id: planAnchor(p) })) }] : []),
              ...(rv.whatsNext ? [{ title: "What's Next", id: "rv-whats-next", sub: [] }] : []),
            ];
            return <TableOfContents entries={entries} />;
          })()}

          {/* 1. Executive Summary */}
          <div className="pagebreak" />
          <h2 id="rv-exec">Executive Summary</h2>
          {rv.exec ? para(rv.exec) : <p className="italic text-slate-400">No executive summary yet — fill it in under Narrative → Annual Review Report.</p>}

          {/* 2. Key Points */}
          <h3 id="rv-keypoints">Key Points</h3>
          {rv.keyPoints ? paraLead(rv.keyPoints, "dash") : <p className="italic text-slate-400">No key points yet — add them under Narrative → Annual Review Report.</p>}

          {/* How we plan — a refresher before looking at this year's position.
              Shares the full report's toggle so one switch governs both. */}
          {client.sections.hierarchy && (<>
            <h3 id="rv-hierarchy">The Hierarchy of Needs in Financial Planning</h3>
            {para(EDU_SECTIONS[0].body)}
            <div style={{ breakInside: "avoid", margin: "10px 0 18px" }}><HierarchyPyramid title={false} /></div>
          </>)}

          {/* 3. Current Plans & Coverage */}
          <div className="pagebreak" />
          <h2 id="rv-current-plans">Current Plans &amp; Coverage</h2>
          <p className="text-xs text-slate-500 mb-2">Existing insurance plans on file, as entered in the Current Coverage step.</p>
          <CurrentPlansTable client={client} report />
          <CurrentPremiumBudget client={client} d={d} />

          {/* 4. Current Financial Health */}
          <div className="pagebreak" />
          <h2 id="rv-health">Current Financial Health</h2>
          {rv.financialHealthDone ? (
            <>
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
              {d.cash > 0 && d.ef6 > 0 && (() => {
                const months = d.totalExpenses > 0 ? d.cash / d.totalExpenses : 0;
                const pass3 = months >= 3; const pass6 = months >= 6;
                const pct3 = Math.min(100, (d.cash / d.ef3) * 100);
                const pct6 = Math.min(100, (d.cash / d.ef6) * 100);
                return (
                  <div className="my-4 border border-slate-200 rounded-xl p-4">
                    <StaticEmergencyFund months={months} cash={d.cash} ef3={d.ef3} ef6={d.ef6} pct3={pct3} pct6={pct6} pass3={pass3} pass6={pass6} />
                  </div>
                );
              })()}
              {d.ratioBars.length > 0 && (<div className="my-3"><div className="text-xs text-slate-500 mb-1 text-center">Financial ratios vs. benchmark — capped at 100% (green = healthy, red = needs attention).</div><StaticRatioBars data={d.ratioBars} /></div>)}
            </>
          ) : (
            <p>Please note that we have not yet conducted a full Financial Health Check. This is a comprehensive diagnostic tool used to map out your entire financial landscape — from debt management to wealth distribution. The advantage of this process is that it identifies "blind spots" in your financial planning that standard policy reviews might miss, ensuring every dollar you save is working efficiently toward your long-term goals. Should you wish to gain this deeper level of clarity, we can schedule a dedicated session for this whenever you are ready.</p>
          )}

          {(client.history || []).filter(h => h.date).length >= 2 && (
            <div style={{ breakInside: "avoid" }}>
              <h3 id="rv-progress">Your Progress Since Previous Reviews</h3>
              <p className="text-xs text-slate-500 mb-1">Where things stood at each review we have on record — the point of an annual review is the direction of travel, not any single year's figures.</p>
              <ProgressCharts history={client.history} />
              <ProgressTable history={client.history} report />
            </div>
          )}

          {/* 5. Overview of Plans */}
          <div className="pagebreak" />
          <h2 id="rv-overview">Overview of Plans</h2>
          <p className="text-xs text-slate-500 mb-2">This is a summary of your current in-force insurance plans as of {todayLong()} that is disclosed. Current value from Investment plans is not included in this overview (if any).</p>
          <div data-docx-capture="reviewTimeline"><CoverageTimelinePanel client={client} printMode={true} /></div>

          {/* 6. Recommendations */}
          <div className="pagebreak" />
          <h2 id="rv-recommendations">Recommendations</h2>
          <p className="mb-2">This is a summary of plan option recommendations for your coverage gaps and investment opportunities in insurance. Further info is provided in the Explanation of Recommendations section that follows.</p>
          <h3 id="rv-contingency">Contingency Planning</h3>
          <table><tbody>
            <tr><td>Emergency Funds</td><td>{rv.contingencyNote || ("Allocate " + money(d.ef3) + " as emergency funds")}</td><td className="tnum italic text-slate-500">No Return</td></tr>
          </tbody></table>
          <h3 id="rv-plans">{optionsMode ? "Plan Options" : "4-3-2-1 Recommended Plans"}</h3>
          <table><tbody>
            <tr><td>Emergency fund needed (3–6 months of expenses)</td><td className="tnum">{money(d.ef3)} – {money(d.ef6)}</td></tr>
            <tr><td>Amount saved</td><td className="tnum">{money(d.cash)}</td></tr>
            <tr><td className="font-semibold">{d.cash >= d.ef3 ? "Within target" : "Shortfall to 3-month target"}</td><td className={"tnum font-semibold " + (d.cash >= d.ef3 ? "text-purple-900" : "text-red-700")}>{money(Math.max(0, d.ef3 - d.cash))}</td></tr>
          </tbody></table>
          {d.insuredGroups.length === 0 && <p className="italic text-slate-400">No recommended plans yet — add them in the Recommended Plans step.</p>}
          <QuotationTables groups={d.insuredGroups} grandMonthly={d.premMonthly} grandAnnual={d.premAnnual} optionsMode={optionsMode} />

          {/* 7. Explanation of Recommendations */}
          {d.selected.length > 0 && (<><div className="pagebreak" /><h2 id="rv-explanations">Explanation of Recommendations</h2>
            {uniqueExplanations(d.selected).map((p, i) => {
              const parts = PLAN_LIBRARY[p.key] ? renderPlanBody(PLAN_LIBRARY[p.key].body) : { main: null, limitations: null };
              return (
                <div key={p.key} style={{ breakBefore: i > 0 ? "page" : "auto" }}>
                  <h3 id={planAnchor(p)}>{i + 1}. {PLAN_LIBRARY[p.key] ? PLAN_LIBRARY[p.key].name : p.label}</h3>
                  {parts.main}
                  {PLAN_LIBRARY[p.key]?.tables && <PlanBodyTables tables={PLAN_LIBRARY[p.key].tables} note={PLAN_LIBRARY[p.key].tablesNote} riders={p.riders} />}
                  {(p.planImages || []).length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {p.planImages.map(img => (
                        <div key={img.id} style={{ breakInside: "avoid", marginBottom: 16, textAlign: "center" }}>
                          <PlanImage img={img} alt={img.caption || img.name} style={{ maxWidth: "100%", border: "1px solid #e2e8f0", borderRadius: 6, display: "inline-block" }} />
                          {img.caption && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, textAlign: "center", fontStyle: "italic" }}>{img.caption}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {parts.limitations}
                </div>
              );
            })}</>)}

          {/* What's Next */}
          {rv.whatsNext && (<>
            <div className="pagebreak" />
            <h2 id="rv-whats-next">What's Next</h2>
            {paraLead(rv.whatsNext, "num")}
          </>)}

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
          {navRow(RefreshCw, "Review Report", false, () => { persist(); setView("review"); }, { iconSize: 16, fontSize: 12, style: { opacity: 0.75 } })}
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
                {(client.expenses[g.id] || []).map((row, i) => {
                  // premiums from Current Coverage fill this row unless a figure is typed over them
                  const fromPlans = row.key ? (d.planPremiums[row.key] || 0) : 0;
                  const effective = expenseRowAmount(row, d.planPremiums);
                  const usingPlans = fromPlans > 0 && String(row.amount ?? "").trim() === "";
                  return (
                  <div key={row.id || i} className="grid grid-cols-12 gap-2">
                    <div className="col-span-4"><Input value={row.label} onChange={e => { const list = [...client.expenses[g.id]]; list[i] = { ...row, label: e.target.value }; updateDeep("expenses", { [g.id]: list }); }} placeholder="Item" /></div>
                    <div className="col-span-2">
                      <NumInput value={row.amount} onChange={e => { const list = [...client.expenses[g.id]]; list[i] = { ...row, amount: e.target.value }; updateDeep("expenses", { [g.id]: list }); }} placeholder={fromPlans > 0 ? fmt(fromPlans, 2) : ""} className={usingPlans ? "bg-purple-50 border-purple-200" : ""} />
                      {fromPlans > 0 && <div className="text-[11px] text-purple-700 mt-0.5">{usingPlans ? "from plans on file" : "plans on file: " + money(fromPlans, 2)}</div>}
                    </div>
                    <div className="col-span-2 text-right text-xs text-slate-500 tabular-nums self-center">{money(effective * 12)}/yr</div>
                    <div className="col-span-3"><Input value={row.note} onChange={e => { const list = [...client.expenses[g.id]]; list[i] = { ...row, note: e.target.value }; updateDeep("expenses", { [g.id]: list }); }} placeholder="Remarks (if any)" /></div>
                    <div className="col-span-1 flex items-center"><button onClick={() => updateDeep("expenses", { [g.id]: client.expenses[g.id].filter((_, j) => j !== i) })} className="text-red-500 text-sm">✕</button></div>
                  </div>
                  );
                })}
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
            <InvestedAssetRows rows={client.assets.invested} onChange={l => updateDeep("assets", { invested: l })} />
          </SectionCard>
          <SectionCard title={"Liquid assets (cash & equivalents) — " + money(d.cash)} right={<button onClick={() => updateDeep("assets", { liquid: [...client.assets.liquid, { id: uid(), name: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add asset</button>}>
            <MoneyRows rows={client.assets.liquid} onChange={l => updateDeep("assets", { liquid: l })} namePlaceholder="e.g. Savings account" />
            <div className="mt-2 text-sm text-slate-600">Emergency fund target: {money(d.ef3)} (3 mo) – {money(d.ef6)} (6 mo)</div>
          </SectionCard>
          <SectionCard title={"Personal items — " + money(d.personal)} right={<button onClick={() => updateDeep("assets", { personal: [...client.assets.personal, { id: uid(), name: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add asset</button>}>
            <MoneyRows rows={client.assets.personal} onChange={l => updateDeep("assets", { personal: l })} namePlaceholder="e.g. Motor vehicle" />
          </SectionCard>
          <SectionCard title={"Liabilities — " + money(d.totalLiab)} right={<button onClick={() => update({ liabilities: [...client.liabilities, { id: uid(), name: "", amount: "" }] })} className="text-sm text-purple-800 hover:underline">+ Add liability</button>}>
            <LiabilityRows rows={client.liabilities} onChange={l => update({ liabilities: l })} />
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
              <Field label="SPK projected (lump sum at retirement)"
                hint={spkFromHoldings(client)?.lumpSum > 0 && !(num(client.retirement.spkProj) > 0)
                  ? "Using " + money(spkFromHoldings(client).lumpSum) + " from your SPK holding under Current Coverage — type here to override"
                  : undefined}>
                <NumInput value={client.retirement.spkProj} onChange={e => updateDeep("retirement", { spkProj: e.target.value })}
                  placeholder={spkFromHoldings(client)?.lumpSum > 0 ? String(spkFromHoldings(client).lumpSum) : ""} />
              </Field>
              <Field label="Old age pension (total)"><NumInput value={client.retirement.pension} onChange={e => updateDeep("retirement", { pension: e.target.value })} /></Field>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">SPK Annuity (Employer) — total: <span className="text-purple-900">{money(d.spkAnnuityTotal)}</span></div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Monthly amount"
                  hint={spkFromHoldings(client)?.annuityMonthly > 0 && !(num(client.retirement.spkAnnuityMonthly) > 0)
                    ? "Using " + money(spkFromHoldings(client).annuityMonthly) + "/mo from your SPK holding"
                    : undefined}>
                  <NumInput value={client.retirement.spkAnnuityMonthly} onChange={e => updateDeep("retirement", { spkAnnuityMonthly: e.target.value })}
                    placeholder={spkFromHoldings(client)?.annuityMonthly > 0 ? String(spkFromHoldings(client).annuityMonthly) : ""} />
                </Field>
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
            <Field label="Report mode" hint="A recommendation is a costed proposal — plan tiers, subtotals and the 4-3-2-1 budget check. Plan options is a menu for a client who just wants to see what is available: per-plan premiums stay, totals and tiers come off.">
              <select value={client.reportMode || "recommendation"} onChange={e => update({ reportMode: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                <option value="recommendation">Recommendation — costed proposal</option>
                <option value="options">Plan options — listing only, no totals</option>
              </select>
            </Field>
            <Field label="Client's indicated monthly budget (appears in the report legend)">
              <Input value={client.budgetNote} onChange={e => update({ budgetNote: e.target.value })} />
            </Field>
            <p className="text-xs text-slate-500 mt-3">Plans are quoted per insured person. Each person below becomes its own quotation table in the report, and its own set of bars on the Overview timeline's Recommended view.</p>
          </SectionCard>
          {quoteTargets.map(person => {
            const mine = client.products.filter(p => (p.insuredBy || "self") === person.id);
            const inc = mine.filter(p => p.include);
            return (
              <SectionCard
                key={person.id}
                title={person.name + (person.relationship ? " (" + person.relationship + ")" : "")}
                right={<div className="flex items-center gap-3">
                  {inc.length > 0 && <span className="text-sm text-slate-500">{money(inc.reduce((s, p) => s + num(p.monthly), 0), 2)}/mo · {money(inc.reduce((s, p) => s + num(p.annual), 0), 2)}/yr</span>}
                  <select value="" onChange={e => { if (!e.target.value) return; update({ products: [...client.products, newProduct(e.target.value, person.id)] }); }} className="text-sm rounded-lg border border-purple-300 text-purple-800 font-semibold px-2 py-1 bg-white">
                    <option value="">+ Add plan…</option>
                    {PRODUCT_CATALOGUE.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>}
              >
                {mine.length === 0
                  ? <div className="text-sm text-slate-400">No plans quoted for {person.name} yet — add one above.</div>
                  : <div className="space-y-3">
                      {mine.map((p, idx) => (
                        <RecommendedPlanCard
                          key={p.id}
                          p={p}
                          clientId={client.id}
                          insuredOptions={quoteTargets}
                          canMoveUp={idx > 0}
                          canMoveDown={idx < mine.length - 1}
                          onMove={dir => {
                            // swap with the neighbour in this person's list; positions of
                            // everyone else's plans in client.products stay put
                            const all = [...client.products];
                            const slots = all.map((x, i) => [x, i]).filter(([x]) => (x.insuredBy || "self") === person.id).map(([, i]) => i);
                            const from = slots[idx], to = slots[idx + dir];
                            if (from == null || to == null) return;
                            [all[from], all[to]] = [all[to], all[from]];
                            update({ products: all });
                          }}
                          onChange={next => update({ products: client.products.map(x => x.id === p.id ? next : x) })}
                          onRemove={() => update({ products: client.products.filter(x => x.id !== p.id) })}
                        />
                      ))}
                    </div>}
              </SectionCard>
            );
          })}
          <p className="text-xs text-slate-400 mt-3">Each selected plan automatically brings its full explanation page (from your product library) into the report.</p>
        </>)}

        {step === 6 && (<>
          <SectionCard title="Overview">
            <CoverageTimelinePanel client={client} />
          </SectionCard>
          <SectionCard title="Current Plans & Coverage">
            <p className="text-xs text-slate-500 mb-3">Every policy on file, policy by policy, grouped by who it insures — pulled straight from the Current Coverage step.</p>
            <CurrentPlansTable client={client} />
          </SectionCard>
          <SectionCard title="Total Insurance Needs">
            <InsuranceNeedsSummary client={client} update={update} />
          </SectionCard>
          <SectionCard title="Progress over the years">
            <p className="text-xs text-slate-500 mb-3">Dated snapshots of the headline figures, so income and net worth can be tracked review by review. Captured by hand, so nothing is recorded until the fact-find is final.</p>
            <ProgressPanel client={client} d={d} update={update} />
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

          <SectionCard title="Annual Review Report — content (for existing clients)">
            <p className="text-xs text-slate-500 mb-3">This feeds the separate <b>Review Report</b> — a shorter annual check-in document, distinct from the full Preview Report above. It pulls Current Plans, Recommendations and Explanations straight from the steps you've already filled in; the fields below are just the review-specific narrative.</p>
            <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 mb-4">
              <Field label="Review meeting notes" hint="Paste your notes from the meeting — rough is fine. The draft is written from these; the client's data on file is used only to keep figures honest.">
                <TextArea rows={7} value={client.review.meetingNotes || ""} onChange={e => updateDeep("review", { meetingNotes: e.target.value })}
                  placeholder={"e.g. Second child due March. Wants to move house in 2 yrs.\nWorried about hospital costs after mother's surgery.\nSalary up to $4,200. Emergency fund still only ~1 month.\nAgreed: top up CI cover, revisit endowment at next review."} />
              </Field>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={draftReviewFromNotes} disabled={draftingReview} className="bg-purple-700 hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors">
                  {draftingReview ? "Drafting…" : "\u2726 Draft review from notes"}
                </button>
                <span className="text-xs text-slate-500">Fills the three fields below — always read them through before sending.</span>
              </div>
              {reviewDraftError && <p className="mt-2 text-sm text-red-600">{reviewDraftError}</p>}
            </div>
            <Field label="Executive summary (meeting recap)" hint="What changed since last time, and why it matters — e.g. a growing family, drifting spending, a new goal."><TextArea rows={6} value={client.review.exec} onChange={e => updateDeep("review", { exec: e.target.value })} /></Field>
            <div className="h-4" />
            <Field label="Key points from the discussion" hint="One point per line, formatted 'Title — detail'. E.g. 'Growing Family — your second child arrives this year, so coverage needs an update.'"><TextArea rows={8} value={client.review.keyPoints} onChange={e => updateDeep("review", { keyPoints: e.target.value })} /></Field>
            <div className="h-4" />
            <label className="flex items-center gap-2 text-sm py-1">
              <input type="checkbox" checked={client.review.financialHealthDone} onChange={e => updateDeep("review", { financialHealthDone: e.target.checked })} className="w-4 h-4 accent-purple-700" />
              Financial Health Check completed this meeting (finances/ratios are up to date)
            </label>
            <p className="text-xs text-slate-400 mb-3 ml-6">Leave unchecked to show a "not yet conducted" note instead of the ratio tables — use this when the client hasn't updated their income/expenses since the last review.</p>
            <Field label="Contingency planning note" hint={"Auto-suggested from your Emergency Fund step: " + money(d.ef3) + " (3 months of expenses). Leave blank to use this."}><TextArea rows={2} value={client.review.contingencyNote} onChange={e => updateDeep("review", { contingencyNote: e.target.value })} placeholder={"Allocate " + money(d.ef3) + " as emergency funds — no return"} /></Field>
            <div className="h-4" />
            <Field label="What's next (numbered)" hint="Same numbered 'Title: detail' format as the Action Plan."><TextArea rows={6} value={client.review.whatsNext} onChange={e => updateDeep("review", { whatsNext: e.target.value })} /></Field>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={() => { persist(); setView("review"); }} className="bg-purple-900 hover:bg-purple-950 text-white font-semibold px-6 py-3 rounded-xl">Preview &amp; print review report →</button>
          </div>
        </>)}
        </main>
      </div>
    </div>
  );
}
