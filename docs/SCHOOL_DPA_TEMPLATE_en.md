# Data processing agreement — school and LUNA (template)

> Template to adapt, **not legal advice**. Have the Madrid lawyer/gestor review it before it is sent to a school. Fields in [brackets] are filled per school. Spanish version: `SCHOOL_DPA_TEMPLATE_es.md`.

**Between** [School legal name], [address], tax ID [..] (the **School**, controller), **and** [LUNA legal name — `LUNA_LEGAL_NAME`], [address — `LUNA_LEGAL_ADDRESS`], tax ID [..] (**LUNA**, processor). Date: [..].

## 1. Purpose and roles
1.1 The School uses LUNA to give its teachers and students AI-assisted study tools. For the student data it decides to put into LUNA, the School is the controller and LUNA is the processor (art. 28 GDPR).
1.2 For accounts that a student, teacher or family member opens on their own, LUNA is the controller (see the Privacy Policy). This agreement covers only data the School brings or instructs LUNA to process.

## 2. Description of the processing
| Item | Detail |
|---|---|
| Subject and duration | Providing LUNA to the School; for the length of the School’s use plus the return/deletion period in section 9. |
| Nature and purpose | Storing course material and student work, generating quizzes, summaries and study plans with AI, marking answers as guidance, showing progress to teachers and families. |
| Categories of data subjects | Students (some under 14), teachers, parents/guardians. |
| Categories of data | Name, school email, role, age band or birth date, uploaded study material, answers and results, study plans, usage data. No special-category data is requested; the School must not upload it. |
| Frequency | Continuous while the service is used. |

## 3. Instructions
LUNA processes the data only on the School’s documented instructions (this agreement, the School’s use of the product, and written instructions), unless the law requires otherwise, in which case LUNA informs the School first unless forbidden. LUNA tells the School if it believes an instruction breaks data-protection law.

## 4. Confidentiality
Everyone at LUNA with access is bound by confidentiality and gets access only as needed.

## 5. Security (art. 32)
Encryption in transit; hashed passwords; access limited by account, live sharing grants and role; row-level security enabled on all database tables; AI requests sent with provider retention switched off where available; logging of access to administration functions; backups held at the infrastructure provider. LUNA reviews these measures at least yearly and will describe them in more detail on request.

## 6. Sub-processors
6.1 The School gives general authorisation for the sub-processors below. LUNA will tell the School at least [30] days before adding or replacing one; the School may object on reasonable grounds, and if it is not resolved the School may end the service for the affected data.

| Sub-processor | Service | Location | Safeguard |
|---|---|---|---|
| Supabase | database and file storage | [EU region confirmed: ..] | DPA + SCCs/DPF |
| Vercel | hosting and scheduled jobs | [region: ..] | DPA + SCCs/DPF |
| OpenAI | generating content and marking answers | US | DPA + SCCs/DPF; retention switched off where offered; no training |
| Anthropic | reading PDFs and scans | US | DPA + SCCs/DPF; no training |
| Mathpix | reading formulas in images | US | DPA |
| [Email provider] | service emails | [..] | DPA |

6.2 LUNA imposes on each sub-processor obligations equivalent to this agreement and stays responsible to the School for them.

## 7. International transfers
Transfers outside the EEA take place only under the safeguards in section 6 (adequacy decision, EU–US Data Privacy Framework where the provider is certified, or standard contractual clauses).

## 8. Help with data-subject rights, DPIA and breaches
8.1 LUNA gives the School tools (export, correction, deletion) and reasonable help to answer requests from students and families, and forwards to the School any request it receives about School data.
8.2 LUNA helps with impact assessments and prior consultation where required.
8.3 LUNA tells the School **without undue delay and within [48] hours** of becoming aware of a personal-data breach affecting School data, with what it knows (nature, data and people affected, likely consequences, measures taken), so the School can notify the AEPD within 72 hours when required.

## 9. End of the service
When the service ends, LUNA returns the School’s data in a usual format on request and then deletes it within [30] days, including copies, except what the law requires LUNA to keep. Accounts that individual users opened for themselves are not affected.

## 10. Audits
LUNA provides the information needed to show compliance and allows reasonable audits by the School or an auditor it appoints, with [30] days’ notice, during business hours and without exposing other customers’ data.

## 11. Children
The School confirms it holds the parental authorisations and legal basis it needs to register students, including under-14s (LOPDGDD art. 7 and 12), and that its information notices tell families that LUNA uses AI providers. LUNA does not use student data for advertising or to build marketing profiles and does not use it to train AI models.

## 12. General
Liability follows the main service terms [or: is limited to ..]. This agreement is governed by Spanish law; the courts of [Madrid] have jurisdiction. If it conflicts with the service terms on data protection, this agreement prevails.

Signed for the School: [name, role, date] — Signed for LUNA: [name, role, date]
