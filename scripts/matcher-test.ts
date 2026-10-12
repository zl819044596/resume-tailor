// matcher 真实样例验证:node --experimental-strip-types scripts/matcher-test.ts
// 三组样例:对口(nurse)/不对口(accountant vs nurse JD)/高匹配(刻意改写)。
// 断言只做合理性与单调性,分数绝对值靠人眼核对输出。

import { matchResumeToJob } from '../src/lib/matcher.ts';

const NURSE_JD = `Job Title: Registered Nurse (RN) — Medical-Surgical Unit

About the role
We are hiring a registered nurse for our 36-bed medical-surgical unit. You will coordinate patient care, administer medications, and work closely with physicians and case managers.

Responsibilities
- Assess, plan and evaluate nursing care for up to 6 patients per shift
- Administer IV therapy, wound care and medication administration
- Chart in Epic EHR and maintain accurate patient records
- Educate patients and families on discharge planning and disease management
- Respond to rapid response and code blue events
- Precept new graduate nurses and support a culture of patient safety

Requirements
- Current RN license, BLS and ACLS certification required
- 2+ years of med-surg or acute care experience
- Strong EHR charting skills (Epic preferred)
- BSN degree preferred
- Excellent communication and teamwork skills

Benefits: competitive salary, shift differentials, tuition reimbursement, 401k match.`;

const NURSE_RESUME = `Maria Lopez, RN, BSN
Registered Nurse — Medical-Surgical Unit

SUMMARY
RN with 4 years of medical-surgical experience in a 400-bed teaching hospital. Epic certified, precepted 6 new graduate nurses.

EXPERIENCE
Staff Nurse, Med-Surg, St. Mary Hospital, 2021-present
- Care for 5-6 patients per shift: assessment, medication administration, IV therapy, wound care
- Charted in Epic EHR daily; unit super-user for charting workflows
- Responded to rapid response and code blue events; ACLS and BLS certified
- Precepted new graduate nurses and led fall-prevention huddles
- Patient education on discharge planning, wound care and disease management

EDUCATION
BSN, Nursing, State University, 2020`;

const ACCOUNTANT_RESUME = `John Smith
Senior Accountant

SUMMARY
Accountant with 8 years of experience in month-end close, reconciliations and financial reporting.

EXPERIENCE
Senior Accountant, Acme Corp
- Managed month-end close and general ledger reconciliations
- Prepared financial statements and variance analysis
- Managed accounts payable and accounts receivable cycles
- ERP migration and process automation with SQL and Excel

EDUCATION
BS Accounting, CPA in progress`;

const TAILORED_NURSE_RESUME = `Maria Lopez, RN, BSN
Registered Nurse — Medical-Surgical Unit (Epic EHR)

SUMMARY
Med-surg registered nurse, 4 years acute care on a 36-bed unit. Current RN license, BLS and ACLS certification, Epic charting super-user, preceptor for new graduate nurses.

EXPERIENCE
Staff Nurse, Med-Surg, St. Mary Hospital, 2021-present
- Assess, plan and evaluate nursing care for 5-6 patients per shift; coordinate patient care and work closely with physicians and case managers
- Administer IV therapy, wound care and medications; maintain accurate patient records in Epic EHR
- Respond to rapid response and code blue events
- Educate patients and families on discharge planning and disease management
- Precept 6 new graduate nurses; communication and teamwork on a patient safety culture

EDUCATION
BSN degree, Nursing, State University, 2020`;

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

// 1. 对口样例
const r1 = matchResumeToJob(NURSE_RESUME, NURSE_JD);
console.log('\n== nurse resume vs nurse JD ==');
console.log(`score=${r1.score} title="${r1.jdTitle}" titleMatched=${r1.titleMatched} resumeWords=${r1.resumeWordCount} jdWords=${r1.jdWordCount}`);
console.log('missing top8:', r1.missing.slice(0, 8).map((h) => `${h.term}x${h.jdCount}`).join(', '));
check('分数在 0-100', r1.score >= 0 && r1.score <= 100);
check('对口样例应中等偏上(≥55)', r1.score >= 55, `score=${r1.score}`);
check('职位名识别为 RN 行', /registered nurse/i.test(r1.jdTitle), r1.jdTitle);
check('职位名在简历头部命中', r1.titleMatched);
check('缺失清单非空且有分量', r1.missing.length > 0 && r1.missing[0].jdCount >= 1);
check('Epic 在简历中应命中(matched)', r1.matched.some((h) => h.term === 'epic'));
check('tips 至少 3 条', r1.tips.length >= 3);

// 2. 不对口样例:分数应显著低于对口,护士核心词应全部缺失
const r2 = matchResumeToJob(ACCOUNTANT_RESUME, NURSE_JD);
console.log('\n== accountant resume vs nurse JD ==');
console.log(`score=${r2.score}`);
check('不对口分数应低(<35)', r2.score < 35, `score=${r2.score}`);
check('分数单调:对口 > 不对口', r1.score > r2.score);
check('nurse 应在缺失清单', r2.missing.some((h) => h.term === 'nurse'));
check('accountant 简历无 nurse 词', !r2.matched.some((h) => h.term === 'nurse'));

// 3. 高匹配样例:应接近满分区间,缺失清单接近空
const r3 = matchResumeToJob(TAILORED_NURSE_RESUME, NURSE_JD);
console.log('\n== tailored nurse resume vs nurse JD ==');
console.log(`score=${r3.score} missing=${r3.missing.length} matched=${r3.matched.length}`);
console.log('r3 missing all:', r3.missing.map((h) => `${h.term}x${h.jdCount}`).join(', '));
check('刻意对齐后分数应高(≥80)', r3.score >= 80, `score=${r3.score}`);
check('单调:r3 > r1(针对性改写有效)', r3.score > r1.score);
check('缺失词条很少(≤10)', r3.missing.length <= 10, `missing=${r3.missing.length}`);

// 4. 边界:空输入不炸
const r4 = matchResumeToJob('', '');
check('空输入不炸且分数 0', r4.score === 0);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
