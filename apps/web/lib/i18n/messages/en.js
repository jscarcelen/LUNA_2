import auth from "./en/auth.js";
import classes from "./en/classes.js";
import classroom from "./en/classroom.js";
import landing from "./en/landing.js";
import common from "./en/common.js";
import courses from "./en/courses.js";
import dialogs from "./en/dialogs.js";
import help from "./en/help.js";
import home from "./en/home.js";
import misc from "./en/misc.js";
import mobile from "./en/mobile.js";
import nav from "./en/nav.js";
import people from "./en/people.js";
import plans from "./en/plans.js";
import practice from "./en/practice.js";
import progress from "./en/progress.js";
import shell from "./en/shell.js";

/** English UI text: the source of truth. Flat dotted keys; `{name}` placeholders; plurals as `key.one` / `key.other`. One file per area in ./en/. */
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
  ...shell
};
