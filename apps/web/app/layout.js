import "./globals.css";

export const metadata = {
  title: "LUNA Platform",
  description: "Scalable placeholder UI for LUNA"
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
