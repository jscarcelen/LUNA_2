import landing from "./en/landing.js";
import auth from "./en/auth.js";

/** English UI text: the source of truth. Flat dotted keys; `{name}` placeholders; plurals as `key.one` / `key.other`. */
export default {
  ...landing,
  ...auth
};
