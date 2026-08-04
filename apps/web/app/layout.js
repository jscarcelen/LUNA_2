import "./globals.css";

export const metadata = {
  title: "LUNA Platform",
  description: "Scalable placeholder UI for LUNA"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
