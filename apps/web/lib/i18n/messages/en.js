import auth from "./en/auth.js";
import landing from "./en/landing.js";
import common from "./en/common.js";
import help from "./en/help.js";
import home from "./en/home.js";
import nav from "./en/nav.js";
import shell from "./en/shell.js";

/** English UI text: the source of truth. Flat dotted keys; `{name}` placeholders; plurals as `key.one` / `key.other`. One file per area in ./en/. */
export default {
  ...auth,
  ...landing,
  ...common,
  ...help,
  ...home,
  ...nav,
  ...shell
};
