"use client";
import { useLocale } from "../../lib/i18n/LocaleProvider.js";
import { LunaLogo } from "../brand/LunaLogo.js";

/**
 * Trust & compliance: what the law asks (Spain/EU and US), what Luna does with data, how it is protected, and what is still in progress.
 * Every line states something the product does today or says plainly that it is not finished: nothing here is a certification claim.
 * The binding texts are /terms, /privacy and /ai (lib/legalTexts*.js); keep this page consistent with them.
 */
const COPY = {
  en: {
    eyebrow: "Trust & compliance",
    title: "Your study data is yours.",
    lead: "Luna is used by students, many of them minors, and by their teachers and families. This page says what the law requires in Spain, the EU and the US, what Luna does with data, and how it is protected, including what is still in progress.",
    langSwitch: "Español",
    status: "Beta · built to follow GDPR, LOPDGDD and COPPA · not certified, not legal advice",
    cards: [
      ["No selling, no ads", "We never sell personal data, never show ads and never build marketing profiles. Luna earns from subscriptions, not from your data."],
      ["AI sees only what a task needs", "The text, images and questions needed for a task go to our AI providers. Not your name or email: contact details typed into free text are masked first. Content is not used to train models."],
      ["Grounded in your material", "Answers, quizzes and summaries are built from the documents you uploaded. Each one must quote the passage it comes from, the quote is checked against your document in code, and a second check flags what the material does not support. AI marks are guidance: a teacher can review and change them."],
      ["Children protected first", "Under 14 (13 in the US) a parent or guardian must agree before an account exists. Under-18s cannot sell, cannot connect with strangers and get the strictest AI privacy settings."]
    ],
    sections: [
      { h: "What Luna does with data", ul: [
        "Collects only what the service needs: account details (name, email, role, age), the material you upload, your answers and results, and basic technical data to keep you signed in.",
        "Sends task text to AI providers (OpenAI, Anthropic and, for formulas in images, Mathpix) under agreements that limit use to providing the service, with provider-side retention switched off where available.",
        "Shows teachers and parents a student's performance only when the student has accepted the connection. A peer connection never shows performance.",
        "Lets you download all your data and delete your account at any time. Deletion has a 30-day grace period you can cancel by signing in, then everything is erased.",
        "Deletes inactive accounts: after 24 months without a sign-in we email you; if you still do not return within 30 days the deletion process starts.",
        "Uses only the cookie needed to keep you signed in. No advertising or analytics cookies."
      ] },
      { h: "How it is protected", ul: [
        "Everything travels encrypted (HTTPS). Passwords are stored as one-way hashes, never in the clear, and repeated failed log-ins lock the account for a while.",
        "Access is decided on the server for every request: your own data, or what someone shared with you through a live, revocable permission. Teachers and parents only see students linked to them.",
        "Database row-level security is on for every table, so the public database interface exposes nothing.",
        "Data minimisation before AI: names and emails are never part of the prompts, and phone numbers or emails typed into free text are masked.",
        "Anti-hallucination checks on everything Luna writes from your material: a quote that must exist in your document, figures that must appear in it, a Stated / Inferred / Could not be confirmed label, and a second independent check. What fails is removed or marked.",
        "Uploaded files and generated material stay private until you share them.",
        "A written procedure for personal-data breaches: assess, contain, tell the Spanish data authority (AEPD) within 72 hours when required, and tell affected people and schools without delay."
      ] },
      { h: "Spain and the EU", ul: [
        "GDPR (Regulation 2016/679): lawful bases, purpose limitation, data minimisation, security, and your rights to access, correct, export, erase, restrict and object. You can use them from Settings or by writing to us.",
        "LOPDGDD (Organic Law 3/2018): a child under 14 needs the consent of parents or guardians. Luna keeps only the child's first name, birth date and the guardian's email for 48 hours until the guardian decides.",
        "Automated decisions (GDPR art. 22): Luna's scores and diagnoses are study guidance, never a final grade, admission or certification, and a person can review any mark.",
        "International transfers: AI providers are in the US, covered by the EU–US Data Privacy Framework or standard contractual clauses. We are moving our own hosting to EU regions (see “Still in progress”).",
        "Supervisory authority: the Agencia Española de Protección de Datos (AEPD), where you can complain if you think we got something wrong. We keep a record of processing and a data protection impact assessment."
      ] },
      { h: "United States", ul: [
        "COPPA: we do not let a child under 13 create an account without verifiable consent from a parent, who can review and delete the child's data.",
        "FERPA: when a school puts student records in Luna, we act on the school's instructions as a service provider under a data processing agreement, and never use those records for advertising.",
        "State privacy laws (such as California's CCPA/CPRA): we do not sell or share personal information for advertising, and you can ask to see, correct or delete yours.",
        "Student-privacy laws in several states restrict advertising and profiling of students; Luna does neither."
      ] },
      { h: "Still in progress", ul: [
        "Signing data processing agreements with every provider, requesting zero data retention from the AI providers and confirming EU regions: under way, not complete.",
        "Independent legal review of these texts and a data processing agreement for schools (template ready): pending.",
        "Payments are not live yet. When they are, you will pay the subscription and pay-as-you-go for resources, including lunas; the marketplace works in lunas only and lunas cannot be turned into cash.",
        "No security certification yet (such as ISO 27001 or SOC 2). We will say so here when that changes."
      ] }
    ],
    docs: "Read the full texts",
    contact: "Questions or a request about your data? Write to the address in our Privacy Policy."
  },
  es: {
    eyebrow: "Confianza y cumplimiento",
    title: "Tus datos de estudio son tuyos.",
    lead: "Luna la usan estudiantes, muchos menores, y sus docentes y familias. Esta página explica qué exige la ley en España, la UE y EE. UU., qué hace Luna con los datos y cómo los protege, incluido lo que aún está en curso.",
    langSwitch: "English",
    status: "Beta · diseñada para cumplir RGPD, LOPDGDD y COPPA · sin certificar, no es asesoramiento jurídico",
    cards: [
      ["Ni venta ni publicidad", "Nunca vendemos datos personales, ni mostramos anuncios ni creamos perfiles comerciales. Luna se financia con suscripciones, no con tus datos."],
      ["La IA ve solo lo que cada tarea necesita", "El texto, las imágenes y las preguntas necesarios para una tarea van a nuestros proveedores de IA. No tu nombre ni tu correo: los datos de contacto escritos en texto libre se enmascaran antes. El contenido no se usa para entrenar modelos."],
      ["Basada en tu material", "Las respuestas, cuestionarios y resúmenes se hacen con los documentos que subes. Cada uno debe citar el pasaje del que sale, la cita se comprueba en código contra tu documento y una segunda comprobación señala lo que el material no respalda. Las notas de la IA son orientación: un docente puede revisarlas y cambiarlas."],
      ["Menores, primero", "Con menos de 14 años (13 en EE. UU.) un padre, madre o tutor debe aceptar antes de que exista la cuenta. Los menores de 18 no pueden vender, no se conectan con desconocidos y tienen los ajustes de privacidad de IA más estrictos."]
    ],
    sections: [
      { h: "Qué hace Luna con los datos", ul: [
        "Recoge solo lo que el servicio necesita: datos de cuenta (nombre, correo, rol, edad), el material que subes, tus respuestas y resultados y datos técnicos básicos para mantener tu sesión.",
        "Envía el texto de cada tarea a proveedores de IA (OpenAI, Anthropic y, para fórmulas en imágenes, Mathpix) con acuerdos que limitan su uso a prestar el servicio y, cuando existe, con la retención del proveedor desactivada.",
        "Muestra a docentes y familias el rendimiento de un estudiante solo si el estudiante ha aceptado la conexión. Una conexión entre iguales nunca muestra rendimiento.",
        "Te deja descargar todos tus datos y borrar tu cuenta cuando quieras. El borrado tiene 30 días de gracia que puedes cancelar iniciando sesión; después se elimina todo.",
        "Elimina cuentas inactivas: tras 24 meses sin iniciar sesión te escribimos; si en 30 días sigues sin volver, empieza el proceso de borrado.",
        "Usa solo la cookie necesaria para mantener tu sesión. Sin cookies de publicidad ni de analítica."
      ] },
      { h: "Cómo se protegen", ul: [
        "Todo viaja cifrado (HTTPS). Las contraseñas se guardan como hash de un solo sentido, nunca en claro, y varios intentos fallidos bloquean la cuenta un tiempo.",
        "El acceso se decide en el servidor en cada petición: tus propios datos, o lo que alguien comparta contigo con un permiso vigente y revocable. Docentes y familias solo ven a estudiantes vinculados con ellos.",
        "La seguridad a nivel de fila de la base de datos está activada en todas las tablas, de modo que la interfaz pública de la base no expone nada.",
        "Minimización antes de la IA: nombres y correos nunca forman parte de los prompts, y los teléfonos o correos escritos en texto libre se enmascaran.",
        "Comprobaciones contra alucinaciones en todo lo que Luna escribe con tu material: una cita que debe existir en tu documento, cifras que deben aparecer en él, una etiqueta Indicado / Inferido / No confirmado y una segunda comprobación independiente. Lo que falla se elimina o se marca.",
        "Los archivos subidos y el material generado son privados hasta que los compartes.",
        "Un procedimiento escrito ante brechas de datos personales: evaluar, contener, avisar a la Agencia Española de Protección de Datos (AEPD) en 72 horas cuando proceda, y avisar sin demora a personas afectadas y centros."
      ] },
      { h: "España y la UE", ul: [
        "RGPD (Reglamento 2016/679): bases jurídicas, limitación de la finalidad, minimización, seguridad y tus derechos de acceso, rectificación, portabilidad, supresión, limitación y oposición. Puedes ejercerlos desde Ajustes o escribiéndonos.",
        "LOPDGDD (Ley Orgánica 3/2018): un menor de 14 años necesita el consentimiento de su madre, padre o tutor. Luna guarda solo el nombre de pila, la fecha de nacimiento y el correo del tutor durante 48 horas hasta que este decide.",
        "Decisiones automatizadas (art. 22 RGPD): las puntuaciones y diagnósticos de Luna son orientación de estudio, nunca una nota final, admisión ni certificación, y una persona puede revisar cualquier corrección.",
        "Transferencias internacionales: los proveedores de IA están en EE. UU., amparados por el Marco de Privacidad de Datos UE–EE. UU. o cláusulas contractuales tipo. Estamos moviendo nuestro propio alojamiento a regiones de la UE (véase «Aún en curso»).",
        "Autoridad de control: la Agencia Española de Protección de Datos (AEPD), donde puedes reclamar si crees que nos equivocamos. Mantenemos un registro de actividades de tratamiento y una evaluación de impacto."
      ] },
      { h: "Estados Unidos", ul: [
        "COPPA: no dejamos que un menor de 13 años cree una cuenta sin consentimiento verificable de un progenitor, que puede revisar y borrar los datos del menor.",
        "FERPA: cuando un centro pone expedientes de estudiantes en Luna, actuamos según sus instrucciones como proveedor de servicios bajo un contrato de encargo de tratamiento, y nunca usamos esos datos para publicidad.",
        "Leyes estatales de privacidad (como la CCPA/CPRA de California): no vendemos ni compartimos información personal para publicidad, y puedes pedir verla, corregirla o borrarla.",
        "Varias leyes estatales de privacidad estudiantil limitan la publicidad y la elaboración de perfiles de estudiantes; Luna no hace ninguna de las dos."
      ] },
      { h: "Aún en curso", ul: [
        "Firma de contratos de encargo con cada proveedor, solicitud de retención cero a los proveedores de IA y confirmación de regiones de la UE: en marcha, sin completar.",
        "Revisión jurídica independiente de estos textos y contrato de encargo para centros (plantilla lista): pendiente.",
        "Los pagos aún no están activos. Cuando lo estén, pagarás la suscripción y el pago por uso de recursos, incluidas las lunas; el mercado funciona solo con lunas y las lunas no se pueden convertir en dinero.",
        "Aún no tenemos certificación de seguridad (como ISO 27001 o SOC 2). Lo diremos aquí cuando cambie."
      ] }
    ],
    docs: "Lee los textos completos",
    contact: "¿Dudas o una solicitud sobre tus datos? Escribe a la dirección de nuestra Política de Privacidad."
  }
};

export function TrustTab() {
  const { locale: lang } = useLocale();
  const c = COPY[lang];
  const q = `?lang=${lang}`;
  return (
    <section className="lp-trust">
      <div className="lp-wrap lp-trust-wrap">
        <div className="lp-trust-head">
          <LunaLogo mark size={34} />
          <span className="lp-eyebrow">{c.eyebrow}</span>
          <h1 className="lp-h2">{c.title}</h1>
          <p className="lp-sub">{c.lead}</p>
          <p className="lp-trust-status">{c.status}</p>
        </div>
        <div className="lp-trust-cards">
          {c.cards.map(([title, text]) => (
            <article key={title} className="lp-trust-card"><h2 className="lp-h4">{title}</h2><p>{text}</p></article>
          ))}
        </div>
        <div className="lp-trust-sections" lang={lang}>
          {c.sections.map((section) => (
            <section key={section.h} className="lp-trust-section">
              <h2 className="lp-h3">{section.h}</h2>
              <ul className="lp-list">{section.ul.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ))}
        </div>
        <p className="lp-trust-docs">
          {c.docs}: <a href={`/privacy${q}`}>Privacy</a> · <a href={`/terms${q}`}>{lang === "es" ? "Condiciones" : "Terms"}</a> · <a href={`/ai${q}`}>{lang === "es" ? "Aviso de IA" : "AI notice"}</a>
        </p>
        <p className="lp-fine">{c.contact}</p>
      </div>
    </section>
  );
}
