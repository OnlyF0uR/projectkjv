import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import "./app.css";

export default function App() {
  return (
    <Router
      root={props => (
        <MetaProvider>
          <Title>King James Bible</Title>
          <script
        innerHTML={`
          (() => {
            try {
              const theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (_) {}

            window.toggleTheme = () => {
              const isDark = document.documentElement.classList.contains('dark');
              document.documentElement.classList.toggle('dark', !isDark);
              try {
                localStorage.setItem('theme', isDark ? 'light' : 'dark');
              } catch (_) {}
              updateThemeIcon();
            };

            window.updateThemeIcon = () => {
              const isDark = document.documentElement.classList.contains('dark');
              const button = document.querySelector('.theme-toggle');
              if (!button) return;
              
              const svg = button.querySelector('svg');
              if (!svg) return;

              if (isDark) {
                // Sun icon for when in dark mode
                svg.innerHTML = '<g><circle cx="10" cy="10" r="4" fill="currentColor"/><line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="16" x2="10" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18" y1="10" x2="16" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="10" x2="2" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="15.5" y1="4.5" x2="14.1" y2="5.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5.9" y1="14.1" x2="4.5" y2="15.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="15.5" y1="15.5" x2="14.1" y2="14.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5.9" y1="5.9" x2="4.5" y2="4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g>';
              } else {
                // Moon icon for when in light mode
                svg.innerHTML = '<path d="M17.39 15.14A7.33 7.33 0 0 1 11.75 1.6c.23-.11.56-.23.79-.34a8.19 8.19 0 0 0-5.41.45 9 9 0 1 0 7 16.58 8.42 8.42 0 0 0 4.29-3.84 5.3 5.3 0 0 1-1.03.69z" fill="currentColor"/>';
              }
            };

            // Update icon on page load
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', updateThemeIcon);
            } else {
              updateThemeIcon();
            }
          })();
        `}
        />
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
