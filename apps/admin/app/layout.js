export const metadata = {
  title: "LUNA Admin",
  description: "Admin placeholder"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, padding: "2rem" }}>{children}</body>
    </html>
  );
}
