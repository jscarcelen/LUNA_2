/**
 * Language of the words a component prints by itself — "Answer", "True / False", "Name", "Date",
 * "Page 2", "Section 1", "Front / Back"… They are fixed text in the component design, not AI
 * output, so changing the agent's language does not reach them. This module translates them to the
 * output's language, and works out that language when the agent says "same as the material".
 */
import type { Element, GroupElement, Template } from "../engine/types";

export type LabelLanguage = "en" | "es" | "fr" | "de" | "it" | "pt" | "ca" | "nl" | "zh" | "ja" | "ar";

interface Words {
  answer: string; true: string; false: string; name: string; date: string; sure: string; high: string; medium: string; low: string;
  pts: string; section: string; front: string; back: string; word: string; translation: string; example: string; important: string;
  page: string; source: string; passage: string;
}

const WORDS: Record<LabelLanguage, Words> = {
  en: { answer: "Answer", true: "True", false: "False", name: "Name", date: "Date", sure: "How sure are you?", high: "High", medium: "Medium", low: "Low", pts: "pts", section: "Section", front: "Front", back: "Back", word: "Word", translation: "Translation", example: "Example", important: "Important", page: "Page {{page}}", source: "Source", passage: "passage" },
  es: { answer: "Respuesta", true: "Verdadero", false: "Falso", name: "Nombre", date: "Fecha", sure: "¿Qué seguridad tienes?", high: "Alta", medium: "Media", low: "Baja", pts: "pts", section: "Sección", front: "Anverso", back: "Reverso", word: "Palabra", translation: "Traducción", example: "Ejemplo", important: "Importante", page: "Página {{page}}", source: "Fuente", passage: "fragmento" },
  fr: { answer: "Réponse", true: "Vrai", false: "Faux", name: "Nom", date: "Date", sure: "Es-tu sûr(e) ?", high: "Élevée", medium: "Moyenne", low: "Faible", pts: "pts", section: "Section", front: "Recto", back: "Verso", word: "Mot", translation: "Traduction", example: "Exemple", important: "Important", page: "Page {{page}}", source: "Source", passage: "passage" },
  de: { answer: "Antwort", true: "Wahr", false: "Falsch", name: "Name", date: "Datum", sure: "Wie sicher bist du?", high: "Hoch", medium: "Mittel", low: "Niedrig", pts: "Pkt.", section: "Abschnitt", front: "Vorderseite", back: "Rückseite", word: "Wort", translation: "Übersetzung", example: "Beispiel", important: "Wichtig", page: "Seite {{page}}", source: "Quelle", passage: "Textstelle" },
  it: { answer: "Risposta", true: "Vero", false: "Falso", name: "Nome", date: "Data", sure: "Quanto sei sicuro?", high: "Alta", medium: "Media", low: "Bassa", pts: "pt", section: "Sezione", front: "Fronte", back: "Retro", word: "Parola", translation: "Traduzione", example: "Esempio", important: "Importante", page: "Pagina {{page}}", source: "Fonte", passage: "brano" },
  pt: { answer: "Resposta", true: "Verdadeiro", false: "Falso", name: "Nome", date: "Data", sure: "Quão seguro estás?", high: "Alta", medium: "Média", low: "Baixa", pts: "pts", section: "Secção", front: "Frente", back: "Verso", word: "Palavra", translation: "Tradução", example: "Exemplo", important: "Importante", page: "Página {{page}}", source: "Fonte", passage: "passagem" },
  ca: { answer: "Resposta", true: "Cert", false: "Fals", name: "Nom", date: "Data", sure: "Quina seguretat tens?", high: "Alta", medium: "Mitjana", low: "Baixa", pts: "pts", section: "Secció", front: "Anvers", back: "Revers", word: "Paraula", translation: "Traducció", example: "Exemple", important: "Important", page: "Pàgina {{page}}", source: "Font", passage: "fragment" },
  nl: { answer: "Antwoord", true: "Waar", false: "Onwaar", name: "Naam", date: "Datum", sure: "Hoe zeker ben je?", high: "Hoog", medium: "Gemiddeld", low: "Laag", pts: "ptn", section: "Onderdeel", front: "Voorkant", back: "Achterkant", word: "Woord", translation: "Vertaling", example: "Voorbeeld", important: "Belangrijk", page: "Pagina {{page}}", source: "Bron", passage: "passage" },
  zh: { answer: "答案", true: "正确", false: "错误", name: "姓名", date: "日期", sure: "你有多确定？", high: "高", medium: "中", low: "低", pts: "分", section: "部分", front: "正面", back: "背面", word: "单词", translation: "翻译", example: "例子", important: "重要", page: "第 {{page}} 页", source: "来源", passage: "段落" },
  ja: { answer: "答え", true: "正しい", false: "誤り", name: "名前", date: "日付", sure: "どのくらい自信がありますか？", high: "高", medium: "中", low: "低", pts: "点", section: "セクション", front: "表", back: "裏", word: "単語", translation: "翻訳", example: "例", important: "重要", page: "{{page}} ページ", source: "出典", passage: "箇所" },
  ar: { answer: "الإجابة", true: "صحيح", false: "خطأ", name: "الاسم", date: "التاريخ", sure: "ما مدى ثقتك؟", high: "عالية", medium: "متوسطة", low: "منخفضة", pts: "نقطة", section: "القسم", front: "الأمام", back: "الخلف", word: "كلمة", translation: "ترجمة", example: "مثال", important: "مهم", page: "صفحة {{page}}", source: "المصدر", passage: "مقطع" }
};

const NAMES: Record<string, LabelLanguage> = { english: "en", spanish: "es", español: "es", french: "fr", français: "fr", german: "de", deutsch: "de", italian: "it", italiano: "it", portuguese: "pt", português: "pt", catalan: "ca", català: "ca", dutch: "nl", nederlands: "nl", chinese: "zh", japanese: "ja", arabic: "ar" };

/** "Spanish", "es", "Español"… → a language we have words for. `null` for "same as the material" or unknown. */
export function labelLanguageFrom(value: unknown): LabelLanguage | null {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (text in WORDS) return text as LabelLanguage;
  return NAMES[text] || null;
}

/** The words of a language, for text built outside the template (e.g. the source line). */
export function wordsFor(language: LabelLanguage): Words {
  return WORDS[language] || WORDS.en;
}

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "is", "to", "in", "that", "which", "for", "with", "are", "what", "as", "by", "this"],
  es: ["el", "la", "los", "las", "de", "que", "en", "y", "es", "un", "una", "por", "con", "para", "se", "del", "cuál", "qué"],
  fr: ["le", "la", "les", "des", "de", "est", "et", "un", "une", "que", "dans", "pour", "qui", "du", "au", "quel"],
  de: ["der", "die", "das", "und", "ist", "von", "mit", "den", "ein", "eine", "nicht", "zu", "für", "welche"],
  it: ["il", "lo", "la", "gli", "le", "di", "che", "è", "un", "una", "per", "con", "del", "della", "quale"],
  pt: ["o", "os", "as", "de", "que", "em", "um", "uma", "para", "com", "do", "da", "não", "qual", "é"],
  ca: ["el", "la", "els", "les", "de", "que", "en", "i", "és", "un", "una", "per", "amb", "del", "quin", "quina"],
  nl: ["de", "het", "een", "en", "van", "is", "dat", "op", "te", "voor", "met", "zijn", "welke"]
};

/** Best guess at the language of a text; English when nothing stands out. */
export function detectLanguage(sample: string): LabelLanguage {
  const text = String(sample || "").slice(0, 4000);
  const count = (pattern: RegExp) => (text.match(pattern) || []).length;
  const letters = Math.max(1, count(/\p{L}/gu));
  if (count(/[぀-ヿ]/g) / letters > 0.1) return "ja";
  if (count(/[一-鿿]/g) / letters > 0.2) return "zh";
  if (count(/[؀-ۿ]/g) / letters > 0.3) return "ar";
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  let best: LabelLanguage = "en";
  let bestScore = 0;
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    const score = words.filter((word) => set.has(word)).length;
    if (score > bestScore) { bestScore = score; best = code as LabelLanguage; }
  }
  return best;
}

/** The output's language: the one chosen in the run's questions, else the language the content is in. */
export function resolveOutputLanguage(questions: { id: string; text?: string }[] = [], answers: Record<string, unknown> = {}, contentSample = ""): LabelLanguage {
  const asked = questions.find((question) => /^\s*(output\s+)?(language|idioma|langue|sprache|lingua)\s*$/i.test(String(question.text || "")));
  const chosen = asked ? labelLanguageFrom(answers[asked.id]) : null;
  return chosen || detectLanguage(contentSample);
}

const UPPER_SCRIPTS = new Set<LabelLanguage>(["en", "es", "fr", "de", "it", "pt", "ca", "nl"]);

/** Translates one fixed text of a component (keeping its `{{n}}` / `{{page}}` placeholders and its case). */
export function localizeStatic(value: string, language: LabelLanguage): string {
  if (language === "en") return value;
  const words = WORDS[language];
  const trimmed = value.trim();
  const key = trimmed.toLowerCase();
  const bare = trimmed.replace(/\{\{[^}]*\}\}/g, "");
  const shout = (text: string) => (UPPER_SCRIPTS.has(language) && /\p{L}/u.test(bare) && bare === bare.toUpperCase() ? text.toUpperCase() : text);
  const simple: Record<string, string> = {
    answer: words.answer, true: words.true, false: words.false, name: words.name, date: words.date, "how sure are you?": words.sure,
    high: words.high, medium: words.medium, low: words.low, pts: words.pts, front: words.front, back: words.back, word: words.word,
    translation: words.translation, example: words.example, important: words.important
  };
  if (key in simple) return shout(simple[key]);
  const numbered = /^(section|answer)\s+\{\{n\}\}$/.exec(key);
  if (numbered) return shout(`${numbered[1] === "section" ? words.section : words.answer} {{n}}`);
  if (key === "page {{page}}") return words.page;
  if (/^name\s+_+\s+date\s+_+$/.test(key)) return `${words.name} ______________________     ${words.date} ____________`;
  return value;
}

/** A copy of the template with every fixed text translated. Field values are never touched. */
export function localizeTemplate(template: Template, language: LabelLanguage): Template {
  if (language === "en") return template;
  const walk = (elements: Element[]): Element[] => elements.map((element) => {
    if (element.type === "text" && element.source.type === "static") return { ...element, source: { type: "static", value: localizeStatic(element.source.value, language) } } as Element;
    if (element.type === "group") return { ...element, children: walk((element as GroupElement).children) } as GroupElement;
    return element;
  });
  return { ...template, layouts: template.layouts.map((layout) => ({ ...layout, pages: layout.pages.map((page) => ({ ...page, elements: walk(page.elements) })) })) };
}
