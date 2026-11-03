export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "equityiq-theme";

// Runs in <head> before the page paints, so a dark visitor never sees a light flash.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");}catch(e){}if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;})();`;
