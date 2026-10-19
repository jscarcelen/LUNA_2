import landing from "./es/landing.js";
import auth from "./es/auth.js";

/** Spanish UI text. A key missing here falls back to English (lib/i18n/index.js). Same keys and {placeholders} as en.js (tests/i18n). */
export default {
  ...landing,
  ...auth
};
