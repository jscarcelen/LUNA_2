/** Lets phones install Luna to the home screen and open it like an app (no browser bars). */
export default function manifest() {
  return {
    name: "LUNA",
    short_name: "LUNA",
    description: "Study smarter: your material, AI agents, study plans and progress in one place.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f5f7",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
