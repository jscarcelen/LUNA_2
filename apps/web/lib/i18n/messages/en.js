import auth from "./en/auth.js";
import landing from "./en/landing.js";
import help from "./en/help.js";
import nav from "./en/nav.js";
import shell from "./en/shell.js";

/** English UI text: the source of truth. Flat dotted keys; `{name}` placeholders; plurals as `key.one` / `key.other`. One file per area in ./en/. */
export default {
  ...auth,
  ...landing,
  ...help,
  ...nav,
  ...shell
};
