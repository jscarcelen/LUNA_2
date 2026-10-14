/**
 * The texts of the Terms of Service, Privacy Policy and AI notice. One source of truth: the pages in app/terms,
 * app/privacy and app/ai render these, and the sign-up / guardian screens link to them. Bump TERMS_VERSION
 * (lib/accountsCore.js) whenever a text changes in substance: it is stored with every acceptance.
 *
 * Operator details come from the environment so the legal entity can be filled in without a code change:
 *   LUNA_LEGAL_NAME, LUNA_LEGAL_ADDRESS, LUNA_PRIVACY_EMAIL.
 * These texts were drafted from docs/LEGAL_COMPLIANCE_PLAN.md and must be reviewed by the company's lawyer before launch.
 */
import { TERMS_VERSION } from "./accountsCore.js";
import { aiNoticeEs, privacyPolicyEs, termsOfServiceEs } from "./legalTextsEs.js";

export function operatorDetails(env = process.env) {
  const name = String(env.LUNA_LEGAL_NAME || "").trim() || "LUNA (legal entity being incorporated in Madrid, Spain)";
  const address = String(env.LUNA_LEGAL_ADDRESS || "").trim() || "Madrid, Spain";
  const email = String(env.LUNA_PRIVACY_EMAIL || "").trim() || "";
  return { name, address, email, contact: email || "the contact address shown in the app" };
}

const op = () => operatorDetails();

export function privacyPolicy(lang = "en") {
  const o = op();
  if (lang === "es") return privacyPolicyEs(o);
  return {
    title: "Privacy Policy",
    updated: TERMS_VERSION,
    intro: "LUNA helps students, teachers and parents study with AI. This page says, in plain words, what we collect, why, who we share it with and what you can do. Parents and guardians: the section on children is for you.",
    sections: [
      { h: "Who is responsible", p: [`${o.name}, ${o.address} (“LUNA”, “we”) is the controller of your data. Contact for privacy questions and requests: ${o.contact}.`, "When a school or teacher gives LUNA to its students, the school decides why the data is used and LUNA works for it as a processor under a data-processing agreement."] },
      { h: "What we collect", ul: [
        "Account: name, email, password (stored only as a hash), phone number, role (student, teacher, parent), date of birth (to check age) and the version of these texts you accepted.",
        "What you add: documents and notes you upload, the material LUNA generates from them, study plans, your answers and scores, optional written working or photos of your work for a question, and what you ask LUNA in chat.",
        "Learning data: results per topic and skill, used to show progress and suggest what to study next.",
        "Technical: a session cookie that keeps you logged in (strictly necessary). We do not use advertising or analytics cookies.",
        "Feedback you send from the beta feedback button, including a screenshot if you attach one."
      ] },
      { h: "Why we use it, and the legal basis", ul: [
        "To provide LUNA: create your account, store your material, generate quizzes, plans and summaries, grade answers, show progress (contract).",
        "To keep it safe: prevent abuse, secure accounts, fix bugs (legitimate interest).",
        "To send service emails: confirm your email, reset a password, connection and sharing requests (contract / legitimate interest).",
        "For children under 14: only after a parent or guardian consents (consent, Article 8 GDPR and LOPDGDD art. 7; COPPA verifiable parental consent in the US). For school accounts, the school’s authorisation."
      ] },
      { h: "Children", p: ["Under 14 (13 in the US) a child cannot open an account alone. Until a parent or guardian agrees, we keep only the child’s first name, birth date and the guardian’s email, and delete them after 48 hours. We store no IP address and set no cookie for that request.", "Once consent is given, the guardian gets a parent account and can see, export and delete the child’s data at any time. Accounts of under-18s get extra protection: they cannot sell in the marketplace or make open-network connections with people they do not know, and their content is sent to AI providers with the strictest privacy settings available. We never use children’s data for advertising or to build marketing profiles."] },
      { h: "Who we share it with", p: ["Only service providers that run LUNA for us (processors), under contracts that limit them to our instructions:"], ul: [
        "Hosting and database: Vercel and Supabase.",
        "AI: OpenAI and Anthropic process the text, images and questions needed to generate content and grade answers. We ask them not to retain data for training. Mathpix may process images of formulas.",
        "Email delivery: our email provider.",
        "Payments (when launched): our payment provider or merchant of record."
      ], after: "We do not sell personal data. Some providers are in the United States; transfers rely on the EU–US Data Privacy Framework or Standard Contractual Clauses." },
      { h: "How long we keep it", ul: ["Your account data while the account exists. When you delete your account it is erased after a 30-day grace period (you can cancel by logging in).", "Inactive accounts: if nobody signs in for 24 months we email you; if you still do not sign in within 30 days, the account is scheduled for deletion and erased after the same 30-day grace period. Signing in at any point cancels it.", "Pending guardian requests: 48 hours.", "Photos of your working are sent to the grader and not kept on your attempt record.", "Beta feedback: screenshots 90 days, the text until the beta ends."] },
      { h: "Your rights", p: [`You can access, correct, export and delete your data from Account settings, ask us to restrict or object to processing, and withdraw consent at any time (${o.contact}). Parents and guardians can do this for their child from “My students”. In Spain you can complain to the Agencia Española de Protección de Datos (aepd.es); US residents may also contact the FTC.`] },
      { h: "Automated decisions", p: ["LUNA scores answers and estimates mastery with AI to help you study. These are guidance for you and your teacher, never a final grade, admission or certification: a teacher decides what counts at school. See the AI notice."] },
      { h: "Security and changes", p: ["Data is encrypted in transit, passwords are hashed, access is limited to what is needed, and we will notify the authority and affected people of a serious breach as the law requires. If we change this policy in substance we will tell you and ask you to accept the new version."] }
    ]
  };
}

export function termsOfService(lang = "en") {
  const o = op();
  if (lang === "es") return termsOfServiceEs(o);
  return {
    title: "Terms of Service",
    updated: TERMS_VERSION,
    intro: `These terms are the agreement between you and ${o.name} for using LUNA. By creating an account you accept them.`,
    sections: [
      { h: "Your account", ul: ["You need to be at least 14, or have a parent or guardian’s consent (see the Privacy Policy). Under 18, a parent or guardian is responsible for use of the account.", "Give true information, keep your password secret and tell us if you think someone else is using your account.", "Teachers and schools who register students confirm they hold the parental authorisations the law requires."] },
      { h: "What LUNA is", p: ["LUNA turns study material into quizzes, summaries, flashcards, study plans and similar content using AI, and shows how you are doing. AI can be wrong: check important facts. Scores, feedback and “diagnoses” are study guidance, not an official assessment."] },
      { h: "Your content", ul: ["You keep ownership of what you upload and create. You give LUNA the right to store, process and show it to you and to the people you choose to share it with, and to send it to our AI providers to provide the service.", "Only upload material you have the right to use. Do not share other people’s copyrighted material publicly. Material you upload stays private unless you share it.", "If you believe content on LUNA infringes your rights, write to us and we will review and, where appropriate, remove it."] },
      { h: "Acceptable use", ul: ["No illegal, harmful, abusive or misleading content; no attempts to break, overload or scrape LUNA; no sharing of accounts.", "No attempts to extract other users’ data or to bypass age and consent checks."] },
      { h: "Marketplace", p: ["Adults can publish agents and templates. In the marketplace everything is bought and sold with lunas, never with cash: a buyer pays in lunas and the seller is credited in lunas. Lunas can only be spent inside LUNA (on resources and marketplace items); they cannot be exchanged for money or transferred out of LUNA, and there is no cash payout to sellers. Sellers must give accurate details, may not publish content they have no right to, and are responsible for their listings. Anyone can report a listing from its card and we can remove listings that break these terms. Minors cannot sell."] },
      { h: "Paid plans and lunas", p: ["The only payments in LUNA are the subscription and pay-as-you-go purchases of resources, including lunas. When these are available we will show the price including taxes before you pay, how to cancel and how renewals work. For digital services you can withdraw within 14 days unless you ask us to start immediately and acknowledge you lose that right once the service is used. Lunas are a prepaid balance for use in LUNA only: they are not money or electronic money, cannot be converted into cash and are not refunded except where the law requires. Prices, lunas and their expiry are set out at purchase."] },
      { h: "Availability and liability", p: ["LUNA is provided as is during the beta. We work to keep it available and your data safe but do not promise it will be uninterrupted or error-free. Nothing here limits liability that cannot be limited by law, including for intent or gross negligence and your rights as a consumer."] },
      { h: "Ending the agreement", p: ["You can delete your account at any time from Account settings. We may suspend accounts that break these terms. We may update these terms; for material changes we will ask you to accept the new version."] },
      { h: "Law", p: ["Spanish law applies, without taking away the mandatory consumer protections of where you live. Consumers can bring claims in the courts of their home country."] }
    ]
  };
}

export function aiNotice(lang = "en") {
  if (lang === "es") return aiNoticeEs();
  return {
    title: "AI notice",
    updated: TERMS_VERSION,
    intro: "LUNA uses artificial intelligence. This page explains where, what it can and cannot do, and how people stay in control.",
    sections: [
      { h: "Where AI is used", ul: ["Making quizzes, flashcards, summaries, problem sets, level tests and study plans from your material.", "Reading uploaded files (including scans and formulas).", "Grading written answers and looking at photos of your working, and suggesting what to study next.", "Answering questions you ask LUNA in chat."] },
      { h: "Everything generated is marked", p: ["Content made by AI is generated automatically and can contain mistakes. Check important information against your teacher or textbook."] },
      { h: "People stay in control", ul: ["Scores, feedback, mastery and “why you got it wrong” are guidance for study. They are not a final grade, a certification or a decision about you.", "Teachers see how each answer was marked and decide what counts for school. A student who disagrees with a mark can press “Ask my teacher to review this mark” under any question: the teacher, who is linked to the student in LUNA, then confirms or changes it, and the score follows. Parents can see these reviews but not change them. You can also write to us.", "LUNA does not use AI to make decisions that have legal or similarly significant effects on a person."] },
      { h: "Your data and AI providers", p: ["To do this, the text, images and questions needed for a task are sent to AI providers (OpenAI, Anthropic and, for formulas in images, Mathpix) under contracts that limit use to providing the service. We ask them not to keep it or train on it. We send only what the task needs, not your name or email. For accounts of under-18s we use the strictest privacy settings available and never use their content to train models."] },
      { h: "Limits", p: ["AI can misread handwriting, miss context, be biased or be wrong. If something looks off, tell us with the feedback button and tell your teacher."] }
    ]
  };
}
