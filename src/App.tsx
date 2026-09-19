import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { HomeScreen } from "./library/HomeScreen.tsx";
import { useTheme } from "./lib/useTheme.ts";

/**
 * The parent screens are loaded on demand and land in their own bundle chunk.
 *
 * Same reasoning as the math app's parent dashboard: a child's install should
 * never download the settings screen — which is where the API key lives — and
 * the service worker is configured not to precache that chunk either.
 */
const SettingsScreen = lazy(() =>
  import("./settings/SettingsScreen.tsx").then((m) => ({ default: m.SettingsScreen })),
);

export default function App() {
  // Mounted once, at the root: the theme must be applied before any screen
  // paints, and re-applied when the OS flips at dusk.
  useTheme();

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        {/* An unknown URL is almost always a stale PWA shortcut. Go home rather
            than showing a child a 404 they cannot act on. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
