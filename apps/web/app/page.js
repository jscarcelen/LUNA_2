import { LandingPage } from "../components/LandingPage";

/**
 * Opened as the installed app (home-screen icon, also ones added before the manifest started on
 * /platform), the landing page is skipped: /platform shows Home or sends a logged-out person to /login.
 * Runs before the page paints so the landing page never flashes.
 */
const appRedirect = "try{if(window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches||window.navigator.standalone===true){window.location.replace('/platform')}}catch(e){}";

export default function HomePage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: appRedirect }} />
      <LandingPage />
    </>
  );
}
