/**
 * Spanish versions of the Terms, Privacy Policy and AI notice (same structure as legalTexts.js, which picks them with
 * `?lang=es`). Drafted from the English texts; they must be reviewed by the company's lawyer before launch.
 */
import { TERMS_VERSION } from "./accountsCore.js";

export function privacyPolicyEs(o) {
  return {
    title: "Política de privacidad",
    updated: TERMS_VERSION,
    intro: "LUNA ayuda a estudiantes, docentes y familias a estudiar con IA. Esta página explica con palabras sencillas qué datos recogemos, para qué, con quién los compartimos y qué puedes hacer. Madres, padres y tutores: la sección sobre menores es para vosotros.",
    sections: [
      { h: "Quién es el responsable", p: [`${o.name}, ${o.address} («LUNA», «nosotros») es el responsable del tratamiento de tus datos. Contacto para dudas y solicitudes de privacidad: ${o.contact}.`, "Cuando un centro educativo o un docente ofrece LUNA a su alumnado, el centro decide para qué se usan los datos y LUNA actúa como encargado del tratamiento con un contrato de encargo."] },
      { h: "Qué datos recogemos", ul: [
        "Cuenta: nombre, correo electrónico, contraseña (solo guardada cifrada), teléfono, perfil (estudiante, docente, familia), fecha de nacimiento (para comprobar la edad) y la versión de estos textos que aceptaste.",
        "Lo que añades: documentos y apuntes que subes, el material que LUNA genera, planes de estudio, tus respuestas y notas, tu procedimiento escrito o fotos de él en una pregunta (opcional) y lo que preguntas en el chat.",
        "Datos de aprendizaje: resultados por tema y habilidad, para mostrar tu progreso y sugerir qué estudiar.",
        "Técnicos: una cookie de sesión que te mantiene conectado (estrictamente necesaria). No usamos cookies de publicidad ni de analítica.",
        "Comentarios que envías con el botón de feedback de la beta, con captura de pantalla si la adjuntas."
      ] },
      { h: "Para qué y con qué base legal", ul: [
        "Prestar LUNA: crear tu cuenta, guardar tu material, generar cuestionarios, planes y resúmenes, corregir respuestas y mostrar el progreso (ejecución del contrato).",
        "Mantenerlo seguro: evitar abusos, proteger cuentas y corregir errores (interés legítimo).",
        "Enviar correos del servicio: confirmar el correo, restablecer la contraseña, solicitudes de conexión y de compartir (contrato / interés legítimo).",
        "Menores de 14 años: solo con el consentimiento de su madre, padre o tutor (consentimiento, art. 8 RGPD y art. 7 LOPDGDD; en EE. UU., consentimiento parental verificable de COPPA). En cuentas de centros, la autorización del centro."
      ] },
      { h: "Menores", p: ["Con menos de 14 años (13 en EE. UU.) un menor no puede abrir una cuenta por sí solo. Hasta que su madre, padre o tutor acepte, solo guardamos el nombre de pila del menor, su fecha de nacimiento y el correo del tutor, y los borramos a las 48 horas. No guardamos dirección IP ni ponemos cookies para esa solicitud.", "Una vez dado el consentimiento, el tutor recibe una cuenta de familia y puede ver, exportar y borrar los datos del menor en cualquier momento. Las cuentas de menores de 18 años tienen protección adicional: no pueden publicar en el mercado ni crear conexiones abiertas con desconocidos, y su contenido se envía a proveedores de IA con los ajustes de privacidad más estrictos disponibles. Nunca usamos datos de menores para publicidad ni para crear perfiles comerciales."] },
      { h: "Con quién los compartimos", p: ["Solo con proveedores que hacen funcionar LUNA por nuestra cuenta (encargados del tratamiento), con contratos que los limitan a nuestras instrucciones:"], ul: [
        "Alojamiento y base de datos: Vercel y Supabase.",
        "IA: OpenAI y Anthropic procesan el texto, las imágenes y las preguntas necesarias para generar contenido y corregir respuestas. Les pedimos que no conserven los datos ni los usen para entrenar. Mathpix puede procesar imágenes de fórmulas.",
        "Envío de correo: nuestro proveedor de correo.",
        "Pagos (cuando se lancen): nuestro proveedor de pagos o merchant of record."
      ], after: "No vendemos datos personales. Algunos proveedores están en EE. UU.; las transferencias se basan en el Marco de Privacidad de Datos UE–EE. UU. o en Cláusulas Contractuales Tipo." },
      { h: "Cuánto tiempo los conservamos", ul: ["Los datos de tu cuenta mientras exista. Al borrar tu cuenta se eliminan tras 30 días de gracia (puedes cancelarlo iniciando sesión).", "Solicitudes de tutor pendientes: 48 horas.", "Las fotos de tu procedimiento se envían al corrector y no se guardan en tu intento.", "Comentarios de la beta: las capturas, 90 días; el resto, hasta que acabe la beta."] },
      { h: "Tus derechos", p: [`Puedes acceder, rectificar, exportar y borrar tus datos desde Ajustes de la cuenta, pedir la limitación u oponerte al tratamiento y retirar tu consentimiento en cualquier momento (${o.contact}). Las familias y tutores pueden hacerlo por su hijo o hija desde «Mis estudiantes». En España puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).`] },
      { h: "Decisiones automatizadas", p: ["LUNA puntúa respuestas y estima el dominio con IA para ayudarte a estudiar. Son orientaciones para ti y tu docente, nunca una nota final, admisión ni certificación: el docente decide qué cuenta en el centro. Consulta el aviso de IA."] },
      { h: "Seguridad y cambios", p: ["Los datos viajan cifrados, las contraseñas se guardan cifradas, el acceso se limita a lo necesario y notificaremos a la autoridad y a las personas afectadas ante una brecha grave, como exige la ley. Si cambiamos esta política de forma sustancial te avisaremos y te pediremos aceptar la nueva versión."] }
    ]
  };
}

export function termsOfServiceEs(o) {
  return {
    title: "Condiciones del servicio",
    updated: TERMS_VERSION,
    intro: `Estas condiciones son el acuerdo entre tú y ${o.name} para usar LUNA. Al crear una cuenta las aceptas.`,
    sections: [
      { h: "Tu cuenta", ul: ["Necesitas tener al menos 14 años o el consentimiento de tu madre, padre o tutor (ver la Política de privacidad). Con menos de 18, un tutor es responsable del uso de la cuenta.", "Da datos verdaderos, guarda tu contraseña en secreto y avísanos si crees que otra persona usa tu cuenta.", "Los docentes y centros que registran alumnado confirman que tienen las autorizaciones parentales que exige la ley."] },
      { h: "Qué es LUNA", p: ["LUNA convierte material de estudio en cuestionarios, resúmenes, tarjetas, planes de estudio y similares usando IA, y muestra cómo vas. La IA puede equivocarse: comprueba los datos importantes. Las puntuaciones, comentarios y «diagnósticos» son orientación para estudiar, no una evaluación oficial."] },
      { h: "Tu contenido", ul: ["Sigues siendo titular de lo que subes y creas. Das a LUNA el derecho a almacenarlo, procesarlo y mostrarlo a ti y a las personas con las que decidas compartirlo, y a enviarlo a nuestros proveedores de IA para prestar el servicio.", "Sube solo material que tengas derecho a usar. No compartas públicamente material con derechos de autor de otras personas. El material que subes es privado salvo que lo compartas.", "Si crees que un contenido de LUNA infringe tus derechos, escríbenos y lo revisaremos y, si procede, lo retiraremos."] },
      { h: "Uso aceptable", ul: ["Nada ilegal, dañino, abusivo o engañoso; no intentes romper, sobrecargar ni extraer datos de LUNA; no compartas cuentas.", "No intentes obtener datos de otros usuarios ni saltarte las comprobaciones de edad y consentimiento."] },
      { h: "Mercado", p: ["Las personas adultas pueden publicar agentes y plantillas. Quien vende debe dar datos de identidad exactos, no publicar contenido sin derecho a ello y responde de sus anuncios. Podemos retirar anuncios que incumplan estas condiciones. Los menores no pueden vender."] },
      { h: "Planes de pago y lunas", p: ["Cuando haya planes de pago o compras, mostraremos el precio con impuestos antes de pagar, cómo cancelar y cómo funcionan las renovaciones. En servicios digitales puedes desistir en 14 días salvo que pidas empezar de inmediato y reconozcas que pierdes ese derecho cuando el servicio se use. Los precios, créditos y su caducidad se indican en la compra."] },
      { h: "Disponibilidad y responsabilidad", p: ["LUNA se ofrece tal cual durante la beta. Trabajamos para mantenerlo disponible y tus datos seguros, pero no prometemos que no tenga interrupciones o errores. Nada de esto limita la responsabilidad que la ley no permite limitar, incluida la derivada de dolo o culpa grave, ni tus derechos como consumidor."] },
      { h: "Fin del acuerdo", p: ["Puedes borrar tu cuenta en cualquier momento desde Ajustes. Podemos suspender cuentas que incumplan estas condiciones. Podemos actualizar estas condiciones; ante cambios importantes te pediremos aceptar la nueva versión."] },
      { h: "Ley aplicable", p: ["Se aplica la ley española, sin privarte de las protecciones imperativas de consumo de tu lugar de residencia. Los consumidores pueden reclamar ante los tribunales de su país."] }
    ]
  };
}

export function aiNoticeEs() {
  return {
    title: "Aviso sobre IA",
    updated: TERMS_VERSION,
    intro: "LUNA usa inteligencia artificial. Esta página explica dónde, qué puede y qué no puede hacer, y cómo las personas siguen al mando.",
    sections: [
      { h: "Dónde se usa la IA", ul: ["Crear cuestionarios, tarjetas, resúmenes, problemas, pruebas de nivel y planes de estudio a partir de tu material.", "Leer archivos subidos (incluidos escaneos y fórmulas).", "Corregir respuestas escritas, mirar fotos de tu procedimiento y sugerir qué estudiar.", "Responder a lo que preguntas en el chat."] },
      { h: "Todo lo generado está señalado", p: ["El contenido hecho con IA se genera automáticamente y puede tener errores. Comprueba la información importante con tu docente o tu libro."] },
      { h: "Las personas siguen al mando", ul: ["Las puntuaciones, comentarios, dominio y «por qué fallaste» son orientación para estudiar. No son una nota final, una certificación ni una decisión sobre ti.", "Los docentes ven cómo se corrigió cada respuesta y deciden qué cuenta en el centro. Si no estás de acuerdo con una corrección, puedes pedir a tu docente, o escribirnos, que la revise.", "LUNA no usa IA para tomar decisiones con efectos jurídicos o similares sobre una persona."] },
      { h: "Tus datos y los proveedores de IA", p: ["Para ello, el texto, las imágenes y las preguntas necesarios para cada tarea se envían a proveedores de IA (OpenAI, Anthropic y, para fórmulas en imágenes, Mathpix) con contratos que limitan su uso a prestar el servicio. Les pedimos que no los conserven ni entrenen con ellos. Enviamos solo lo que la tarea necesita, no tu nombre ni tu correo. Para cuentas de menores de 18 años usamos los ajustes de privacidad más estrictos disponibles y nunca usamos su contenido para entrenar modelos."] },
      { h: "Límites", p: ["La IA puede leer mal la letra, perder contexto, tener sesgos o equivocarse. Si algo no cuadra, díselo a tu docente y avísanos con el botón de feedback."] }
    ]
  };
}
