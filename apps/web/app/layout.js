import "./globals.css";

export const metadata = {
  title: "LUNA Platform",
  description: "Scalable placeholder UI for LUNA",
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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
