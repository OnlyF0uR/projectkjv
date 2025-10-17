import { createEffect } from "solid-js";

export default function ThemeToggle() {
  // Ensures hot reloads also update the icon
  if (import.meta.env.DEV) {
    createEffect(() => {
      if (typeof window !== 'undefined' && window.updateThemeIcon) {
        console.log("Updating theme icon from ThemeToggle component");
        window.updateThemeIcon();
      }
    });
  }

  return (
      <button 
        class="theme-toggle" 
        onClick={() => window.toggleTheme && window.toggleTheme()} 
        aria-label="Toggle theme"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        </svg>
      </button>
  );
}