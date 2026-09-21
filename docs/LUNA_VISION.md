# LUNA — Product Vision & Guiding Principles

> **Purpose.** This is the single source of truth for *why* LUNA exists and *what it must become*.
> Every change, extension or refactor of the software has to be checked against it (see the
> `luna-vision` skill in `.claude/skills/`). When the founder gives new context about the idea,
> it is appended here — never lost in chat.
>
> Sections 1–7 are the founder's product instructions (originally given in Spanish on 2026-09-19;
> the verbatim original is kept in Appendix A). Section 8 collects the standing rules given earlier in
> the project. Section 9 is the practical alignment checklist.

---

## 1. The pitch

**We are not selling an app; we are selling a digital environment that adapts to your needs and
follows every student profile — it grows with you, from child to adult.**

Consequences for the product:
- One environment, many profiles, one identity over time (a child user becomes a teenage user
  becomes an adult learner; a parent and a teacher see the same child from different angles).
- Collaboration between accounts (friends, sharing, transfers) is part of the environment, not an
  add-on.

## 2. User profiles

### 2.1 Student — *one person, my own content and my own tracking*
| Sub-profile | Who creates the material | Notes |
|---|---|---|
| **Young child** (< 14) | The **parents** generate the documents | More **gamified** experience. Student profile is **mandatorily linked** to a parent profile. |
| **Teenager** (≥ 14) | The **student** creates the material | The parent **can view** what material the child can make. Link to a parent profile is **optional**. |

### 2.2 Teacher — *many people*
- Generates content for their students.
- Tracks students **per class / level**.
- Being able to show parents the work done and the performance of their children is a key selling
  point ("easier to justify the work and performance of the kids to the parents").
- **End goal: generate a class curriculum targeted to each student / level.**

### 2.3 Parent — *specific children*
- Uses the platform to **track the performance of their children**.
- Young children (< 14): student profile mandatorily linked to the parent profile.
- Teenagers (> 14): profile optionally linked to the parent profile.
- Can also generate content for their children and track them (the "teacher-like" use for the
  parent of a young child).

## 3. Archetypes (what shares a UI and what does not)

| Archetype | Same UI for… | UI rule |
|---|---|---|
| **Content generator & review** | Teacher · Parent of a young child · Teenage student | **One identical UI** for all three. (Workspaces, agents, templates, marketplace, review of generated content.) |
| **Performance tracking** | Teacher · Parent of a young child · Parent of a teenager (?) · Student | **A different UI per profile.** Teacher = class (many children); Student = personal (one person); Parent = specific children. |

## 4. Subscription / onboarding flow

1. Choose the subscription type:
   1. **Teacher**
   2. **Student** → ask the **age of the child**:
      - **< 14** → **mandatory** link to a parent profile.
      - **> 14** → **optional** link to a parent profile.

(Parent accounts exist as the linked side of these flows.)

## 5. Key functionality

### 5.1 Content generator
- **Upload documents** to your workspace.
- **Generate content through agents** — pre-defined ones, or agents shared/bought into your profile —
  leveraging the uploaded documents.
  - **Tool: Agent generator** — its output is **pure JSON without formatting**.
  - **Tool: Template Studio** — generates format templates (PDF, PPT, HTML) that map and paint the
    agents' outputs; the link is between the AI JSON fields and the template.
- **Marketplace**
  - **AI agents.**
  - **Templates** (associated with pre-existing agents):
    - **Whole templates** — e.g. flashcards, exam template with and without answers, vocabulary
      puzzle, long Word document with headings and paragraphs, etc.
    - **Canvas-style blocks** — e.g. a custom "exam question tag" block. Pure design, like the
      premium elements of Canva.


### 5.1a Template Studio — editor model (founder spec, 2026-09-19)

- A **Template** is a reusable visual document structure with **multiple Views**; a View is one output of the same template (e.g. printable exam without answers / with answers, PPT one question per slide, answer key, teacher version). A View can differ in element visibility, order, position, page/slide size, export formats and page structure; the elements stay reusable across views.
- **Left sidebar** = Basic (Text, Heading, Image, Box/Shape, Line/Divider, Table) · **AI fields** · **Premium** pre-built components (Question card, Flashcard, Report structure, Header, Footer, Callout, Section header, Answer box…) · **Custom** (groups saved as reusable components).
- An **AI field is simply text or image + a field name + a type** (plain text, rich text, number, date, boolean…) + **iteration**: once per document / repeat per page / repeat per item. It behaves like a normal text/image element on the canvas. This is preferred over a complex "AI component" system.
- **Canvas**: drag, resize, move, multi-select, group, duplicate, delete, reorder, clear selection, undo/redo — Canva-like but much simpler.
- **Right sidebar** is contextual: page settings when nothing is selected; text styling; AI field (name, type, repeat, styling, visibility); component settings.
- **Top bar**: template name (editable inline) · Saved/Unsaved · Save · View selector · page size · Design | Data | Preview | Export.
- **View management** screen: cards per view (name, formats, size, page count) + New view; view settings = name, description, size (A4, Letter, PPT 16:9, custom), visible elements, order, positioning, export formats.
- **Layers** panel like Canva: reorder, hide/show, group/ungroup, lock.
- **Data tab** explains field → agent output mapping; the editor never depends on an agent.
- **Export**: PDF, Word, PowerPoint, HTML at the View level, respecting size, position, visibility, repeats, order, styling.
- **Component designs**: each premium component family (Question card, Flashcard, Header, Footer, Section header, Callout, Answer box, Table, Formal report, Puzzle, Math problem, Document/file, Table of contents, Diagram, Comparison, Progress bar…) offers **several designs to choose from** via a dropdown.
- **Two design levels**: **Block design** — a drag-and-drop ordered list of blocks (header, questions…) with repetition and formatting options, which flows into any page layout (questions one after another on A4, one per slide in PPT); and **Advanced** — the full page-layout canvas. Fast design and detailed design coexist.
- **Agent-order composition**: blocks combine so they appear in the AI output order — e.g. 3 sections, each a title plus N questions: the user only defines the header and question-card formats and the agent output is laid out accordingly.
- **"One of" designs at the same spot**: several element designs share one position and the AI output decides which one is used per item (e.g. an exam mixing multiple-choice, true/false and written questions — the agent sets the order, the user defines the styles). Combined with forced order (header first) this lets the template follow the agent's output order.
- A **list is a field** (it holds many elements and is repeated consecutively by default) — the UI must make this clear.
- Advanced view shows **one iteration** of a repeating block (the space it takes) with a toggle to preview ×3 repetitions and how overflow pushes the rest down; Preview shows the real repetitions.
- **Groups scale as a whole**: resizing a group resizes every element inside proportionally.
- **Agent-ordered sets, chosen visually by the user**: the user picks which components may appear (cards, titles, callouts…) and their styles; the agent decides the order and which one goes where. The user must not be forced into a fixed combination.
- **Block placement options**: shown once on every page (header/footer) · generated from the agent output · starts at a fixed position (the previous block is clipped/reduced to the space before it) · starts after the previous block · starts on a new page (respecting every-page elements).
- Advanced canvas must stay **clean**: few colours and lines; show groups, repetition, format and space.
- In the block list, every block is marked **fixed here** (the user's order) or **agent decides** (part of an interchangeable set); the user chooses per block which is which.
- Philosophy: Canva (visual) + Notion (blocks) + Google Docs (structure) + Luna (AI content), but much simpler than Canva; avoid too many buttons, nested menus, technical terms, separate editors per format, over-complex AI fields. Mental model: create template → name → view → add elements → design → add AI fields → define repeats → more views → preview → export.


### 5.1b Agent output = template blocks (founder spec, 2026-09-20)

- In the Agent Studio, the **output definition is a drag-and-drop ordering of the same elements and components that exist in Template Studio** — so the mapping between agent output and templates is automatic. The user either **selects a pre-defined template** or **creates one instantly** with the block composer.
- In the agent generator this composition stays at the **simple block level** (structure only, no formatting). Any such structure can be **saved as a template**, and its format refined later in Template Studio.
- **At all times a template is identified with the list of compatible AI agents.**
- The agent output is always **one complete JSON** with all the information (title, subtitle, question tag, answer…); in Template Studio the user creates **views of the same template by hiding fields** — the blocks stay the same, just less crowded (with or without some information).
- A **list is not a separate field type next to the value type**: a field is a text/number/… that may repeat (list of text), as Template Studio shows it (list Options → text Option).

- The agent composer also offers **plain text/image fields** and shows a **preview of each component on the right** (what it looks like, which fields it fills).
- The **JSON order follows the block order** (once components, agent-ordered sets, etc.) and keys are **MECE**, e.g. `component_field` (`header_title`).
- Some values are **document data** (date, topic, course…) filled in **by the user**, not generated, and reused wherever the template needs them.

- Template galleries show the **rendered first page** (A4 preferred, else slide size). Templates must be **easy to delete**.
- A **hidden parallel agent (metaprompt generator)** improves the prompts the creator writes in the agent generator, so the agent's output matches what the user wants and the prompt quality is ensured — never disclosed to the user as a prompt.


### 5.1c Worksheets, interactive activities and the activity layer (founder spec, 2026-09-20)

- Template Studio gets **kids/worksheet components**: match the pairs, word search, tracing, fill in the blanks, multiple choice, cut and paste, colour by code, maze, math practice sets, pair puzzle grids… — be creative, more are welcome.
- A **chatbot lets the user describe a component in words and get it created** (future premium feature).
- Components that imply **answers from students** must have an **interactive HTML version** as the **default output** — exams, quizzes, puzzles, pairs, flashcards are done **on the platform** so errors are tracked; exporting to PDF/Word/PPT is the second option.
- Workspaces gain a layer of **to-do's / activities / courses** with a **folder structure** that is the repository of activities and study resources for the kids — and, ultimately, what Luna uses to **track performance at a very granular level**.

- An **internal design agent** improves custom component requests before building them (plan the exact layout, build, review) so the visual result is excellent — e.g. a 3×3 grid puzzle of word pairs must come out as a clean tile grid.

- The component design agent must **expand simple requests like an expert** (a 4×4 grid = 16 tiles; only touching edges carry word pairs, outer edges empty; edge words aligned with their edge; the interactive version lets the child move tiles to rebuild the grid, the printable lets the teacher cut them).

- Component design rules the founder pointed out (to be applied automatically): no double borders (the tile's box is the cut line); for matching puzzles name the content as numbered pairs (1a/1b, 2a/2b…) so matching edges are guaranteed by construction; the chatbot should accept **reference images** (a worksheet, a drawing) to copy format and shapes for complex components.

### 5.2 Performance tracking (different UIs)
**Views / UI / layout**
- **Teacher** — class tracking (many children).
- **Student** — personal tracking (one person).
- **Parent** — tracking of specific children.

**Tools**
- **Time tracking** — dates, time remaining until an end date, associate tasks with a target
  completion date, **Duolingo-style reminders** (with a place to define the frequency).
- **Completion tracking** — make sure tasks have been done; which are pending.
- **Performance tracking**
  - **By content / topic**, using **objective quantification**: if I generate 20 flashcards and get
    10 right, show **10/20**.
    - For a **teacher**: they can themselves mark good / bad / difficulty, etc.
    - For a **student or parent**: only a summary overview of the grades of the activities, with the
      ability to jump directly to the errors.
    - A **quick-access list of errors made**, filterable and categorisable.
      - We need a **categorisation of error types**, possibly tied to question difficulty, and an
        **agent that, for open answers, measures how far the answer deviates** from the expected one.
      - **Teachers** should be able to set **difficulty thresholds**. This is added value for
        teachers: we save them time — if they define the error and difficulty levels, they no longer
        need to review exams one by one.
      - **Students / parents**: when AI generates content, it must **automatically assign a
        difficulty level to each question**, store it, and use it in performance metrics and error
        categorisation.
        - **Layered agents**: when the generator agent produces content, a **critic / reviewer
          agent** says whether the content is good or not and whether it is easy or hard.
    - Allow **fast generation of content from the workspace to revise the errors**.
  - **By way of studying** — which educational resource types work best for you, which you use most,
    how helpful you rate them for the final exam, etc.

## 6. AI agent generator

- Before generating the agent written by the user, run an **AI model / skill that automatically
  improves the prompt proposed by the user** and makes sure it works well.
- Add a **refinement prompt**.
- **Every agent must show an estimate of token consumption** — how much a run will cost.

## 7. Revenue model

### Constant streams
- **Base subscription (up to X tokens)** — tiers per archetype; each tier allows up to X AI tokens and
  up to X document storage. Everything above must cover cost (OpenAI requests and storage).
  - Price a margin above the expected OpenAI cost.
  - Key calculations:
    - **Storage tiers** — consider profile consumption (a teacher uses more than a 5-year-old
      student, who uses less than a 20-year-old) → expected consumption per archetype.
    - **AI token tiers.**
- **Variable fee** per extra token or megabyte of storage.
- **Marketplace transaction fee.** Options:
  - A share of the money to LUNA and the rest to the user.
  - Money to LUNA and **virtual currency ("lunas") to the selling user**, redeemable for other
    items and tokens.
    - Optionally all transactions must go through our currency, which can also be bought (with a
      hidden fee that makes selling in the marketplace more attractive than paying from your own
      pocket; offers too).
    - Allow **transfers of lunas between users**.
    - **Referral rewards** — bring someone to LUNA and get currency.

### Sharing between students
- Students can **share resources with each other for a cost in lunas** — not through the
  marketplace, but by sending to and collaborating with other accounts. Add **friends**. This is
  what makes it a **digital environment**.

## 8. Agent architecture principles

- The agent architecture is a tool for building agents: **things that control agents**. Agents are
  now smart enough to talk to each other — e.g. one use is reducing cybersecurity attacks. Important
  for a larger platform.
- **Deduplication of agents:** if 7 teachers generate the same agent, they should not be 7 different
  agents but **the same one**. This is close to what LUNA already does with recipes and is useful for
  agentic workflow sets.
- **A set of guardrails** for agents.

## 9. Standing rules given earlier in the project

These were established in previous sessions and remain in force.

**Design language** — crisp, light, Apple-like: solid white surfaces, subtle shadows, generous
whitespace, single accent `#0071e3`, pill buttons, 12–18 px radii. No `backdrop-blur`, no
glassmorphism, no dark mode (rejected as "blurry"). Quality is judged largely by visual polish.

**Every AI agent follows one flow** (Quiz Generator is the role model): a plain-language intro
("what it does / how it works" for people who know nothing about AI) → three steps:
**Configure questions** (material + the agent's predefined choices) → **Configure output** (pick a
template, map JSON fields to template fields, incl. once vs per-item) → **Export** (PDF, Word,
PowerPoint, HTML or save to workspace). Knowledge (agent → JSON) and formatting (template) are
decoupled, so any agent works with any compatible template and both are sold separately.

**Agent Studio is a recipe builder, never a prompt builder.** The canonical object is a structured
`AgentSpec` (purpose, instructions, inputs, context slots — agent knowledge vs user material —,
output schema, examples, validation rules, model config); the prompt and JSON Schema are compiled
from it. Five steps: what it creates → customize → material → output → test & improve. Iteration
edits the spec (not one-off patches). Prompts/JSON only in an Advanced mode. No AI jargon.

**Templates**: `Template → Layout → View`; elements have a content source (static | field); groups
own repetition (flow / one per page / grid) and nest; fields have stable ids separate from names;
templates bind to a schema, not to a specific agent, and must be creatable with no agent at all;
one layout renders to PDF / DOCX / PPTX / HTML; blocks are premium reusable design objects.
Add menus never expose implementation primitives ("spacer", "page break"…).

**Process**: show the proposed architecture and file changes before major rewrites; implement
incrementally with modular components; push when asked. **All deployments go to the public link**
`https://luna2-share-web.vercel.app` (production follows `main`).

## 10. Alignment checklist (use before every change)

1. **Which archetype is this for?** Content generation/review (one shared UI) or performance
   tracking (per-profile UI)? Does it still work for the parent-of-a-young-child and the teenager?
2. **Does it keep agents (content) and templates (presentation) decoupled** and marketplace-sellable
   separately (agents, whole templates, blocks)?
3. **Is it explainable to a non-technical teacher or parent** with no AI jargon?
4. **Does it feed tracking?** Anything that generates questions should carry difficulty, and
   anything a student answers should produce objective scores and a categorised error list.
5. **Cost visibility** — does a new AI action show/estimate token consumption and fit the
   token/storage tier model?
6. **Environment, not app** — does it strengthen identity over time, linking (parent↔child), sharing
   between accounts, friends, lunas?
7. **Agent hygiene** — reuse identical agents instead of duplicating; keep guardrails; layer a
   critic/reviewer where quality or difficulty matters.
8. **Design language and flows** from section 9 respected.

If a request conflicts with this document, say so in one or two sentences, propose the aligned
alternative, and let the founder decide.

---

## Appendix A — Founder's original notes (2026-09-19, verbatim)

```
Perfiles de usuarios:

* Student. Uso la plataforma para generar mi contenido de estudio y tracking personal - solo foco en una persona.
   * Niño pequeño. Este perfil el niño no genera documentos, los generan los padres. Es más gamificado.
   * Adolescente. Es el niño quien hace el material. El padre puede mirar que material puede hacer.
* Teacher. Uso la plataforma para generar contenido para mis estudiantes y tracking de los estudiantes (por clase / nivel, etc,) - foco en multiples personas (es más facil justificar a los padres el trabajo y performance de los niños). End goal es generar class curriculum targeted para cada estudiante / nivel.
* Parent. Uso la plataforma para traquear la perfirmance de mis hijos.
   * Niños pequeños (14). Obligatorio perfil estudiante ligado a perfil de padres.
   * Adolescentes. (>14). Perfil opconal ligado a perfil de padres.
   *  generar contenido para mis estudiantes y tracking de los estudiantes (por clase / nivel, etc,) - foco en multiples personas (es más facil justificar a los padres el trabajo y performance de los niños). End goal es generar class curriculum targeted para cada estudiante / nivel.

Perfiles arquetipos:

* Generador de contenido y revisión - misma UI para todos los perfiles
   * Teacher
   * Parent para niños pequeños
   * Estudiante adolescente
* Tracking de performance - Distinta UI para cada perfil
   * Teacher
   * Padre para niños pequeños
   * Padre para adolescentes?

Flujo subscripción

1. Definir tipo de suscripción
   1. Teacher
   2. Estudiante
      1. Preguntar edad del hijo
         1. Si < 14 -> link obligatorio a perfil padre
         2. Si > 14 -> link opcional a perfil padre

Funcionalidades clave

* Generador de contenido
   * Upload documentos a tu woerkspace
   * Genear contenido a traves de agentes pre-definidos o compardos en tu perfil (leverage uplaoded documents)
      * Tool: generador de agentes de conteido (output es un json sin formato)
      * Tool: template estudio: generador de templates de formato (pdf, ppt, html) oara mapear y pintar outputs de los agentes - link entre campos de json AI con template
   * Marketplae
      * Agentes IA
      * Templates (asociadas a agentes preexistentes)
         * Templates enteras (e.g., flashcard, template de examen con y sin respeustas, puzle de vocuabulario, documento largo word con titulos y parrafos, etc.)
         * Bloques tipo canvas (e.g,.m custom exam question tag block) - puro diseño, como elementos premium de Canvas
   * Performance tracking (distitnas ui)
      * Vistas / UI / Layout
         * Profesor - tracking clase (muchos niños)
         * Estudiante - tracking personal (una persona)
         * Padre - Tracking de niños específicos
      * Tools
         * Tracking temporal, fechas, tiempo pendiente hasta end-date, asociar tasks a una fecha x de completition, incluir reminders tipo duolingo (incluir sitio donde definir frecuencia)
         * Tracking de completition, asegurar que las tareas han sido hechas, cuales están pendientes,
         * Tracking de performance
            * por contenido / topic. Usar cuantificación objetiva. Por ejemplo, si genero 20 flashcarrs y hago 10 bien, que me diga 10/20.
               * Para un profesor, es intersante que el mismo pueda marcar que es bueno / malo / dificultad, etc.
               * Para estudiante o padre, solo es un summary iverviere de las notas de las actividades, y poder referirse directamente a los errroes
               * Se debe incluir un acceso rapido a listado de errores cometidos, filtrable y categotizable
                  * Hay que pensar una categorizacion de los tipos de errores, quiza ligada a la dificultat de la pregunta, y tener un agente que para resouestas abiertas te mire cuanto se desvia
                     * Profesores
                        * Los profesores quiza deberían marcar thresholds de dificultad
                        * Esto es un added value para los profes, pk te quitamos tiempo, si defines los niveles de error y dificultad, te ahorras revisar los examenes uno a uno
                     * Estidiantes / padres
                        * Al generar el contenido por AI, se debe automaticament edefinir el grado de dificultad de cada pregunta, guardadrlo y usarlo en las mñetricas de perfrmancer y categorizacion de errores
                           * Poner capas de agents, de manera que cuando el agente de genere el contenido, haya un agente critico /reviewer) que te diga si el contenido es bueno o no, y si es facil o dificl.
                  * Se debe permitir generar contenido rápido desde el workspace para repasar los errores
            * Por manera de estudio, para saber qué tipo de recursos educativos te van mejor, cuales usas más, que valoración les das de ayuda al examen final, etc.

AI agent generator

* Antes de generar el agente escrito por el usuario, meterle un modelo de IA / skill, que te mejore automaticamente el prompt propuesto por el usuario, y que se asegure de que funcione bien
* Añadir promppt de refinamiento

Todos los agentes deberian de tener un estimate de consumo de tokens de cuanto te va a costar

Revenue model:

* Constant strams
   * Subsrictpoon base (hasta x tokens) - tiers por arquetipos, y según el tier puedes consuir hasta x tokens y subir hasta x espacio de documento, todo lo que pase implica cubrir coste (tanto de requests de OpenAI como de almacenamiento)
      * Poner un rango por encima del coste esperado por OpenAI
      * Calculos clave
         * Tiers de espacio dd almacenamiento (y considerar consumo de los eprfles, un profe es mas que un estudiante de 5 que uno de 20 años) - expected consumption
         * Tiers de tokens de AI
   * Fee por cada token o megabite de almacenamiento extras (variable)
   * Fee de transacciones del marketplace
      * Opciones:
         * una parte del dinero a luna y otra al usuario
         * Dinero a luna, y moneda virtual al usuario que vende para cangear por otros articulos y tokens
            * Y si quieres, tiene que hacer tofdas las transacciones con nuestra moneda, de manera que puedes compralra tambien (con una fee oculta, que te beneficie mas vender cosas en el marketplace, que no poner dinero de tu bolsillo, incluso ofertas)
            * Permitir transfers de dinero de luna entre usuarios
            * Potenciar que si te traes a alguien a luna, te doy dinero

Funcionlidadd de compartir recursos entre estudiantes por un coste de lunas - no meterlo al marketplace, si no enviarse y colaborar entre cuentas - poner friends - estas creando un digital environment

Pitch: no te venod una app, te vendo un digital environment que se adapta a tus necesidades, y sefuimos a todos los perfiles de estudiantes (crecemos contigo, desde niño hasta adulto

Arquitectura de agentes: util para la construccion de agentes - cosas para controlar a los agentes.
Ejemplo: cuando les das tareas a agentes, ahora son suficientmente inteligentes de hablar agentes entre ellos, por ejemplo, reducir ataques de ciberseguirdad - importante para una plataforma mas grande

Si 7 profes te generan los mismos agentes, que no sean distintos agentes, sino que son el mismo - esto es muy parecido a lo que hago. Util en los sets de agentic workflows

Set de guardrails
```

## Appendix B — Change log of this document
- 2026-09-20 — Added §5.1c: worksheet components, component chatbot, interactive activities as default, activity layer in workspaces.
- 2026-09-20 — Added §5.1b: agent output defined with Template Studio blocks, templates list their compatible agents, views hide fields, list-as-flag on fields.
- 2026-09-19 — Created from the founder's notes plus the standing rules from earlier sessions.
- 2026-09-19 — §5.1a: user-chosen agent-ordered sets, block placement options, clean advanced canvas.
- 2026-09-19 — §5.1a: "one of" designs chosen by agent output, list-is-a-field clarity, single-iteration canvas + ×3 toggle, proportional group scaling.
- 2026-09-19 — §5.1a: component design variants, Block vs Advanced design levels, agent-order composition (sections with questions).
- 2026-09-19 — Added §5.1a Template Studio editor model (founder's detailed spec: views, element categories, AI field = text/image + name + type + repeat, contextual inspector, layers, export per view).
