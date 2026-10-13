/** Plural of the people noun used across My students / My children ("student" → "students", "child" → "children"). */
export const pluralNoun = (noun) => (noun === "child" ? "children" : `${noun}s`);
