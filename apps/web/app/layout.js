import "./globals.css";

export const metadata = {
  title: "LUNA Platform",
  description: "Scalable placeholder UI for LUNA"
};

// Applies the stored (or OS) theme before first paint so there is no light/dark flash.
const themeInitScript = `(function(){try{var t=localStorage.getItem("luna-theme");if(t!=="dark"&&t!=="light"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
