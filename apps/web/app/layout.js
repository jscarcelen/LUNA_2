import "./globals.css";
import { SiteFeedback } from "../modules/feedback/SiteFeedback";
import { PwaSetup } from "../modules/pwa/PwaSetup";
import { DialogHost } from "../modules/ui/dialogs.js";
import { LocaleProvider } from "../lib/i18n/LocaleProvider.js";
import { getServerLocale } from "../lib/i18n/server.js";

export const metadata = {
  title: "LUNA Platform",
  description: "Study platform for students, teachers and parents: AI-made quizzes, study plans and shared progress.",
  applicationName: "LUNA",
  // Added to the home screen on an iPhone it opens full screen, like an app.
  appleWebApp: { capable: true, title: "LUNA", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false }
};

// Phones must lay the app out at their own width (and under the notch), not scale a desktop page.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff"
};

// The language comes from the `luna_lang` cookie, then Accept-Language (lib/i18n/server.js), so the layout is dynamic.
export default async function RootLayout({ children }) {
  const locale = await getServerLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>
          {children}
          {/* Beta feedback tool (temporary, see modules/feedback/README.md); the app mounts its own inside AppShell. */}
          <SiteFeedback />
          <PwaSetup />
          {/* LUNA's own confirm / text / notice boxes (modules/ui/dialogs.js), used instead of the browser's. */}
          <DialogHost />
        </LocaleProvider>
      </body>
    </html>
  );
}
