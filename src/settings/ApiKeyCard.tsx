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
import { estimatedLimits, isRecommended, limitsFor } from "@/ai/core/modelLimits";
import { readObservedLimit } from "@/ai/runtime/quota";
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

        {models.length > 0 && <ModelPicker models={models} value={modelId} onChange={setModelId} />}

        {/* Said plainly rather than buried: anything that can run script on this
            origin can read the key. The real mitigations are a separate key,
            restricted to this API and this domain, and the delete button above. */}
        <p className="text-xs text-muted-foreground">{t("apiKeyHelp")}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Which model, and what it costs a family to choose it.
 *
 * The list a key returns is a dozen models of which two are worth picking, so
 * the Gemini 3 Flash families come first and everything else is behind a
 * toggle — a list nobody reads is a default nobody changes.
 *
 * Each one carries its daily allowance, because that is the decision. A model
 * with twenty requests a day is not a slower version of one with five hundred;
 * it is one that stops working on a Tuesday, and there is no way to find that
 * out from its name.
 */
function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: readonly ModelInfo[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);

  const recommended = models.filter((model) => isRecommended(model.id));
  // Nothing recommended in this key's catalogue: showing an empty list with a
  // "show all" button under it would be a riddle.
  const shown = showAll || recommended.length === 0 ? models : recommended;

  const label = (model: ModelInfo): string => {
    const limits = limitsFor(model.id, readObservedLimit(model.id));
    if (!limits) return model.displayName;
    const mark = limits.source === "estimated" ? "~" : "";
    return `${model.displayName} — ${mark}${limits.rpd}/${t("perDay")}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="model">{t("model")}</Label>
      <select
        id="model"
        className="h-10 rounded-lg border border-input bg-background px-3"
        value={value ?? defaultModel(shown)?.id ?? ""}
        onChange={(event) => {
          writeModelId(event.target.value);
          onChange(event.target.value);
        }}
      >
        {shown.map((model) => (
          <option key={model.id} value={model.id}>
            {label(model)}
          </option>
        ))}
      </select>

      {recommended.length > 0 && recommended.length < models.length && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          aria-pressed={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? t("modelRecommended") : t("modelShowAll")}
        </Button>
      )}

      {value && estimatedLimits(value) === null && (
        <p className="text-xs text-muted-foreground">{t("limitUnknown")}</p>
      )}
    </div>
  );
}
