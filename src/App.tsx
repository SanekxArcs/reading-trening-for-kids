import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { HomeScreen } from "./library/HomeScreen.tsx";
import { ReadScreen } from "./read/ReadScreen.tsx";
import { QuizScreen } from "./quiz/QuizScreen.tsx";
import { ResultScreen } from "./result/ResultScreen.tsx";
import { useTheme } from "./lib/useTheme.ts";

/**
 * The parent screens are loaded on demand and land in their own bundle chunk.
 *
 * Same reasoning as the math app's parent dashboard: a child's install should
 * never download the settings screen — which is where the API key will live —
 * and the service worker is configured not to precache that chunk either.
 */
const SettingsScreen = lazy(() =>
  import("./settings/SettingsScreen.tsx").then((m) => ({ default: m.SettingsScreen })),
);
const AddTextScreen = lazy(() =>
  import("./library/AddTextScreen.tsx").then((m) => ({ default: m.AddTextScreen })),
);
const ProgressScreen = lazy(() =>
  import("./progress/ProgressScreen.tsx").then((m) => ({ default: m.ProgressScreen })),
);
const QuestionReviewScreen = lazy(() =>
  import("./library/QuestionReviewScreen.tsx").then((m) => ({ default: m.QuestionReviewScreen })),
);
const ShareScreen = lazy(() =>
  import("./share/ShareScreen.tsx").then((m) => ({ default: m.ShareScreen })),
);
const ImportScreen = lazy(() =>
  import("./share/ImportScreen.tsx").then((m) => ({ default: m.ImportScreen })),
);

export default function App() {
  // Mounted once, at the root: the theme must be applied before any screen
  // paints, and re-applied when the OS flips at dusk.
  useTheme();

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/add" element={<AddTextScreen />} />
        <Route path="/review/:textId" element={<QuestionReviewScreen />} />
        <Route path="/share/:textId" element={<ShareScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/read/:textId" element={<ReadScreen />} />
        <Route path="/quiz/:sessionId" element={<QuizScreen />} />
        <Route path="/result/:sessionId" element={<ResultScreen />} />
        <Route path="/progress" element={<ProgressScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        {/* An unknown URL is almost always a stale PWA shortcut. Go home rather
            than showing a child a 404 they cannot act on. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
