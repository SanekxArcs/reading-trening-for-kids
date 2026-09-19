import { useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/useI18n";
import { GeminiProvider } from "@/ai/gemini/provider";
import { defaultModel, resolveModel } from "@/ai/gemini/models";
import { errorInfo } from "@/ai/core/errors";
import type { ModelInfo } from "@/ai/core/provider";
import {
  clearApiKey,
  maskApiKey,
  readApiKey,
  readCatalog,
  readModelId,
  writeApiKey,
  writeCatalog,
  writeModelId,
} from "@/ai/runtime/key";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; models: ModelInfo[] }
  | { kind: "failed"; message: string };

/**
 * The API key, the model, and an honest account of what storing a key here
 * means.
 *
 * Validation goes through `models.list`: it costs no tokens, touches no daily
 * quota, and returns the catalogue the picker needs — so checking the key and
 * populating the dropdown are the same request.
 */
export function ApiKeyCard() {
  const { t } = useI18n();
  // Read straight into initial state rather than through an effect: these are
  // synchronous localStorage reads, and an effect would render once with an
  // empty key before correcting itself.
  const [saved, setSaved] = useState<string | null>(readApiKey);
  const [modelId, setModelId] = useState<string | null>(readModelId);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>(() => {
    // A cached catalogue means the settings screen opens without a request.
    const key = readApiKey();
    const models = key ? readCatalog(key) : null;
    return models ? { kind: "ok", models } : { kind: "idle" };
  });

  const verify = async (key: string) => {
    setStatus({ kind: "checking" });
    const check = await new GeminiProvider({ apiKey: key }).validateKey();

    if (!check.ok) {
      setStatus({ kind: "failed", message: t(errorInfo(check.code).parentKey) });
      return;
    }

    writeApiKey(key);
    writeCatalog(key, check.models);
    setSaved(key);
    setDraft("");
    setStatus({ kind: "ok", models: check.models });

    // Pick a sensible default the first time, or repair a choice that has since
    // been retired — a 404 on every call is the worst way to learn that.
    const resolved = resolveModel(check.models, readModelId());
    if (resolved) {
      writeModelId(resolved.id);
      setModelId(resolved.id);
    }
  };

  const forget = () => {
    clearApiKey();
    setSaved(null);
    setStatus({ kind: "idle" });
  };

  const models = status.kind === "ok" ? status.models : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("apiKey")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {saved ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
            <span className="font-mono text-sm">{maskApiKey(saved)}</span>
            <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={forget}>
              <Trash2 />
            </Button>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            aria-label={t("apiKey")}
          />
          <Button
            disabled={draft.trim().length === 0 || status.kind === "checking"}
            onClick={() => void verify(draft.trim())}
          >
            {status.kind === "checking" ? <Loader2 className="animate-spin" /> : t("save")}
          </Button>
        </div>

        {status.kind === "ok" && (
          <p className="flex items-center gap-2 text-sm text-correct">
            <Check className="size-4" />
            {t("apiKeyValid", { count: models.length })}
          </p>
        )}
        {status.kind === "failed" && (
          <p className="text-sm text-wrong" role="alert">
            {status.message}
          </p>
        )}

        {models.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="model">{t("model")}</Label>
            <select
              id="model"
              className="h-10 rounded-lg border border-input bg-background px-3"
              value={modelId ?? defaultModel(models)?.id ?? ""}
              onChange={(event) => {
                writeModelId(event.target.value);
                setModelId(event.target.value);
              }}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Said plainly rather than buried: anything that can run script on this
            origin can read the key. The real mitigations are a separate key,
            restricted to this API and this domain, and the delete button above. */}
        <p className="text-xs text-muted-foreground">{t("apiKeyHelp")}</p>
      </CardContent>
    </Card>
  );
}
