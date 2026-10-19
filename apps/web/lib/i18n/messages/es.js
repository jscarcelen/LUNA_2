import auth from "./es/auth.js";
import landing from "./es/landing.js";
import common from "./es/common.js";
import help from "./es/help.js";
import home from "./es/home.js";
import nav from "./es/nav.js";
import shell from "./es/shell.js";

/** Spanish UI text (tú). A key missing here falls back to English (lib/i18n/index.js). Same keys and {placeholders} as en.js, enforced by tests/i18n. One file per area in ./es/. */
export default {
  ...auth,
  ...landing,
  ...common,
  ...help,
  ...home,
  ...nav,
  ...shell
};
