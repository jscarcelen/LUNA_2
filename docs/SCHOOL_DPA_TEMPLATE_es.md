# Contrato de encargo de tratamiento — centro educativo y LUNA (plantilla)

> Plantilla para adaptar, **no es asesoramiento jurídico**. Debe revisarla el abogado/gestor de Madrid antes de enviarla a un centro. Los campos entre [corchetes] se rellenan para cada centro. Versión en inglés: `SCHOOL_DPA_TEMPLATE_en.md`.

**Entre** [Denominación del centro], [domicilio], NIF [..] (el **Centro**, responsable del tratamiento), **y** [Denominación legal de LUNA — `LUNA_LEGAL_NAME`], [domicilio — `LUNA_LEGAL_ADDRESS`], NIF [..] (**LUNA**, encargada del tratamiento). Fecha: [..].

## 1. Objeto y funciones
1.1 El Centro usa LUNA para ofrecer a su profesorado y alumnado herramientas de estudio asistidas por IA. Respecto de los datos de alumnado que decida incorporar a LUNA, el Centro es responsable y LUNA encargada del tratamiento (art. 28 RGPD).
1.2 En las cuentas que un alumno, docente o familiar abre por su cuenta, LUNA es responsable (véase la Política de Privacidad). Este contrato solo cubre los datos que el Centro aporta o instruye a LUNA tratar.

## 2. Descripción del tratamiento
| Elemento | Detalle |
|---|---|
| Objeto y duración | Prestación de LUNA al Centro; mientras el Centro use el servicio más el plazo de devolución o supresión de la cláusula 9. |
| Naturaleza y finalidad | Almacenar material de curso y trabajos del alumnado, generar cuestionarios, resúmenes y planes de estudio con IA, corregir respuestas como orientación y mostrar el progreso a docentes y familias. |
| Categorías de interesados | Alumnado (parte menor de 14 años), docentes, madres/padres/tutores. |
| Categorías de datos | Nombre, correo del centro, rol, franja de edad o fecha de nacimiento, material de estudio subido, respuestas y resultados, planes de estudio, datos de uso. No se piden categorías especiales de datos; el Centro no debe subirlas. |
| Frecuencia | Continua mientras se use el servicio. |

## 3. Instrucciones
LUNA trata los datos solo siguiendo instrucciones documentadas del Centro (este contrato, el uso que el Centro hace del producto e instrucciones escritas), salvo que la ley exija otra cosa; en ese caso lo comunica antes al Centro salvo prohibición legal. LUNA avisará al Centro si cree que una instrucción infringe la normativa de protección de datos.

## 4. Confidencialidad
Todas las personas de LUNA con acceso están sujetas a confidencialidad y acceden solo en la medida necesaria.

## 5. Seguridad (art. 32)
Cifrado en tránsito; contraseñas con hash; acceso limitado por cuenta, permisos de compartición vigentes y rol; seguridad a nivel de fila activada en todas las tablas de la base de datos; peticiones a IA enviadas con la retención del proveedor desactivada cuando existe; registro del acceso a funciones de administración; copias de seguridad en el proveedor de infraestructura. LUNA revisa estas medidas al menos una vez al año y las detallará si se solicita.

## 6. Subencargados
6.1 El Centro da autorización general a los subencargados siguientes. LUNA avisará al Centro con al menos [30] días de antelación de cualquier alta o sustitución; el Centro puede oponerse por motivos razonables y, si no se resuelve, puede poner fin al servicio respecto de los datos afectados.

| Subencargado | Servicio | Ubicación | Garantía |
|---|---|---|---|
| Supabase | base de datos y archivos | [región UE confirmada: ..] | DPA + CCT/DPF |
| Vercel | alojamiento y tareas programadas | [región: ..] | DPA + CCT/DPF |
| OpenAI | generar contenido y corregir respuestas | EE. UU. | DPA + CCT/DPF; retención desactivada cuando se ofrece; sin entrenamiento |
| Anthropic | lectura de PDF y escaneos | EE. UU. | DPA + CCT/DPF; sin entrenamiento |
| Mathpix | lectura de fórmulas en imágenes | EE. UU. | DPA |
| [Proveedor de correo] | correos del servicio | [..] | DPA |

6.2 LUNA impone a cada subencargado obligaciones equivalentes a las de este contrato y sigue siendo responsable ante el Centro.

## 7. Transferencias internacionales
Las transferencias fuera del EEE solo se hacen con las garantías de la cláusula 6 (decisión de adecuación, Marco de Privacidad de Datos UE–EE. UU. si el proveedor está certificado, o cláusulas contractuales tipo).

## 8. Ayuda con derechos, evaluaciones de impacto y brechas
8.1 LUNA ofrece al Centro herramientas (exportación, rectificación, supresión) y ayuda razonable para atender solicitudes del alumnado y las familias, y le traslada cualquier solicitud que reciba sobre datos del Centro.
8.2 LUNA ayuda en evaluaciones de impacto y consultas previas cuando proceda.
8.3 LUNA avisa al Centro **sin dilación indebida y en un máximo de [48] horas** desde que conozca una violación de seguridad que afecte a datos del Centro, con la información disponible (naturaleza, datos y personas afectadas, consecuencias probables, medidas), para que el Centro pueda notificar a la AEPD en 72 horas cuando corresponda.

## 9. Fin del servicio
Al terminar el servicio, LUNA devuelve los datos del Centro en un formato habitual si se solicita y después los suprime en [30] días, incluidas las copias, salvo lo que la ley obligue a conservar. No se ven afectadas las cuentas que cada persona abrió por su cuenta.

## 10. Auditorías
LUNA facilita la información necesaria para demostrar el cumplimiento y permite auditorías razonables del Centro o de un auditor designado por este, con [30] días de preaviso, en horario laboral y sin exponer datos de otros clientes.

## 11. Menores
El Centro confirma que dispone de las autorizaciones parentales y de la base jurídica necesarias para dar de alta al alumnado, incluidos menores de 14 años (LOPDGDD arts. 7 y 12), y que sus avisos informativos indican a las familias que LUNA usa proveedores de IA. LUNA no usa datos del alumnado para publicidad ni para elaborar perfiles comerciales, ni para entrenar modelos de IA.

## 12. Disposiciones generales
La responsabilidad se rige por las condiciones del servicio [o: se limita a ..]. Este contrato se rige por la ley española; son competentes los juzgados de [Madrid]. Si choca con las condiciones del servicio en materia de protección de datos, prevalece este contrato.

Firma por el Centro: [nombre, cargo, fecha] — Firma por LUNA: [nombre, cargo, fecha]
