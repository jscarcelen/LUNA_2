import auth from "./es/auth.js";
import classes from "./es/classes.js";
import classroom from "./es/classroom.js";
import landing from "./es/landing.js";
import common from "./es/common.js";
import courses from "./es/courses.js";
import dialogs from "./es/dialogs.js";
import help from "./es/help.js";
import home from "./es/home.js";
import misc from "./es/misc.js";
import mobile from "./es/mobile.js";
import nav from "./es/nav.js";
import people from "./es/people.js";
import plans from "./es/plans.js";
import practice from "./es/practice.js";
import progress from "./es/progress.js";
import shell from "./es/shell.js";
import usage from "./es/usage.js";

/** Spanish UI text (tú). A key missing here falls back to English (lib/i18n/index.js). Same keys and {placeholders} as en.js, enforced by tests/i18n. One file per area in ./es/. */
export default {
  ...auth,
  ...classes,
  ...classroom,
  ...landing,
  ...common,
  ...courses,
  ...dialogs,
  ...help,
  ...home,
  ...misc,
  ...mobile,
  ...nav,
  ...people,
  ...plans,
  ...practice,
  ...progress,
  ...shell,
  ...usage
};
