import { getApiCallErrorMessage, managementApi } from "../api/client";
import type { ApiCallResult, AuthFile, JsonObject } from "../api/client";

export type QuotaLookupProvider = "antigravity" | "claude" | "codex" | "gemini-cli" | "kimi";
export type RealQuotaStatus = "loading" | "success" | "error" | "unsupported";

export interface RealQuotaMetric {
  id: string;
  label: string;
  percent: number | null;
  amount?: string;
  reset?: string;
  note?: string;
}

export interface RealQuotaResult {
  status: RealQuotaStatus;
  provider: string;
  account: string;
  authIndex: string;
  checkedAt?: string;
  plan?: string | null;
  metrics: RealQuotaMetric[];
  message?: string;
  statusCode?: number;
}

interface GeminiBucket {
  modelId: string;
  tokenType: string | null;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime?: string;
}

interface AntigravityGroupDefinition {
  id: string;
  label: string;
  identifiers: readonly string[];
  labelFromModel?: boolean;
}

const DEFAULT_ANTIGRAVITY_PROJECT_ID = "bamboo-precept-lgxtn";

const ANTIGRAVITY_QUOTA_URLS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];

const ANTIGRAVITY_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "antigravity/1.11.5 windows/amd64",
};

const ANTIGRAVITY_QUOTA_GROUPS: readonly AntigravityGroupDefinition[] = [
  {
    id: "claude-gpt",
    label: "Claude/GPT",
    identifiers: ["claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium"],
  },
  {
    id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    identifiers: ["gemini-3-pro-high", "gemini-3-pro-low"],
  },
  {
    id: "gemini-3-1-pro-series",
    label: "Gemini 3.1 Pro Series",
    identifiers: ["gemini-3.1-pro-high", "gemini-3.1-pro-low"],
  },
  {
    id: "gemini-2-5-flash",
    label: "Gemini 2.5 Flash",
    identifiers: ["gemini-2.5-flash", "gemini-2.5-flash-thinking"],
  },
  {
    id: "gemini-2-5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    identifiers: ["gemini-2.5-flash-lite"],
  },
  {
    id: "gemini-2-5-cu",
    label: "Gemini 2.5 CU",
    identifiers: ["rev19-uic3-1p"],
  },
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    identifiers: ["gemini-3-flash"],
  },
  {
    id: "gemini-image",
    label: "gemini-3.1-flash-image",
    identifiers: ["gemini-3.1-flash-image"],
    labelFromModel: true,
  },
] as const;

const CLAUDE_PROFILE_URL = "https://api.anthropic.com/api/oauth/profile";
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "anthropic-beta": "oauth-2025-04-20",
};

const CLAUDE_USAGE_WINDOW_KEYS = [
  { key: "five_hour", id: "five-hour", label: "5 小时" },
  { key: "seven_day", id: "seven-day", label: "7 天" },
  { key: "seven_day_oauth_apps", id: "seven-day-oauth-apps", label: "OAuth Apps 7 天" },
  { key: "seven_day_opus", id: "seven-day-opus", label: "Opus 7 天" },
  { key: "seven_day_sonnet", id: "seven-day-sonnet", label: "Sonnet 7 天" },
  { key: "seven_day_cowork", id: "seven-day-cowork", label: "Cowork 7 天" },
  { key: "iguana_necktie", id: "iguana-necktie", label: "Iguana Necktie" },
] as const;

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
};

const GEMINI_CLI_QUOTA_URL = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const GEMINI_CLI_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
};

const GEMINI_CLI_QUOTA_GROUPS = [
  {
    id: "gemini-flash-lite-series",
    label: "Gemini Flash Lite Series",
    preferredModelId: "gemini-2.5-flash-lite",
    modelIds: ["gemini-2.5-flash-lite"],
  },
  {
    id: "gemini-flash-series",
    label: "Gemini Flash Series",
    preferredModelId: "gemini-3-flash-preview",
    modelIds: ["gemini-3-flash-preview", "gemini-2.5-flash"],
  },
  {
    id: "gemini-pro-series",
    label: "Gemini Pro Series",
    preferredModelId: "gemini-3.1-pro-preview",
    modelIds: ["gemini-3.1-pro-preview", "gemini-3-pro-preview", "gemini-2.5-pro"],
  },
] as const;

type GeminiGroupDefinition = (typeof GEMINI_CLI_QUOTA_GROUPS)[number];

const GEMINI_CLI_GROUP_ORDER: Map<string, number> = new Map(
  GEMINI_CLI_QUOTA_GROUPS.map((group, index) => [group.id, index] as const),
);

const GEMINI_CLI_GROUP_LOOKUP: Map<string, GeminiGroupDefinition> = new Map(
  GEMINI_CLI_QUOTA_GROUPS.flatMap((group) =>
    group.modelIds.map((modelId) => [modelId, group] as const),
  ),
);

const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
const KIMI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
};

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function intValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.floor(parsed);
}

function quotaFraction(value: unknown): number | null {
  if (typeof value === "string" && value.trim().endsWith("%")) {
    const parsed = Number(value.trim().slice(0, -1));
    return Number.isFinite(parsed) ? parsed / 100 : null;
  }
  return numberValue(value);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function remainingFromUsed(usedPercent: number | null): number | null {
  if (usedPercent === null) {
    return null;
  }
  return clampPercent(100 - usedPercent);
}

function remainingFromFraction(fraction: number | null): number | null {
  if (fraction === null) {
    return null;
  }
  return clampPercent(fraction * 100);
}

function providerName(file: AuthFile): string {
  return String(file.provider ?? file.type ?? "").trim().toLowerCase();
}

function accountName(file: AuthFile): string {
  return file.email ?? file.account ?? file.label ?? file.name;
}

function authIndex(file: AuthFile): string {
  return stringValue(file.auth_index ?? file.authIndex ?? fileRecord(file).AuthIndex) ?? "";
}

function metadataRecord(file: AuthFile): JsonObject | null {
  return isRecord(file.metadata) ? file.metadata : null;
}

function attributesRecord(file: AuthFile): JsonObject | null {
  return isRecord(file.attributes) ? file.attributes : null;
}

function fileRecord(file: AuthFile): JsonObject {
  return file as unknown as JsonObject;
}

function checkedAt(): string {
  return new Date().toISOString();
}

function baseResult(file: AuthFile, status: RealQuotaStatus): RealQuotaResult {
  return {
    status,
    provider: providerName(file) || "-",
    account: accountName(file),
    authIndex: authIndex(file),
    metrics: [],
  };
}

function createStatusError(message: string, status?: number): Error & { status?: number } {
  const error = new Error(message) as Error & { status?: number };
  if (status !== undefined) {
    error.status = status;
  }
  return error;
}

function statusFromError(error: unknown): number | undefined {
  if (isRecord(error)) {
    const status = numberValue(error.status);
    return status === null ? undefined : status;
  }
  return undefined;
}

function payloadRecord(payload: unknown): JsonObject | null {
  if (isRecord(payload)) {
    return payload;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseIdTokenPayload(value: unknown): JsonObject | null {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = payloadRecord(trimmed);
  if (parsed) {
    return parsed;
  }
  const segments = trimmed.split(".");
  if (segments.length < 2 || typeof atob !== "function") {
    return null;
  }
  try {
    const padded = segments[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(segments[1].length / 4) * 4,
      "=",
    );
    return payloadRecord(atob(padded));
  } catch {
    return null;
  }
}

function apiPayload(result: ApiCallResult): unknown {
  return result.body ?? result.bodyText;
}

async function checkedApiCall(
  authIndexValue: string,
  method: string,
  url: string,
  header: Record<string, string>,
  data?: string,
): Promise<ApiCallResult> {
  const result = await managementApi.apiCall({
    auth_index: authIndexValue,
    method,
    url,
    header,
    data,
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  return result;
}

function requireAuthIndex(file: AuthFile): string {
  const value = authIndex(file);
  if (!value) {
    throw new Error("缺少 auth_index，无法通过后端账号查询上游配额");
  }
  return value;
}

function formatDateTime(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatUnixSeconds(value: number | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return formatDateTime(new Date(value * 1000).toISOString());
}

function formatCodexReset(window: JsonObject | null): string | undefined {
  if (!window) {
    return undefined;
  }
  const resetAt = numberValue(window.reset_at ?? window.resetAt);
  if (resetAt !== null && resetAt > 0) {
    return formatUnixSeconds(resetAt);
  }
  const resetAfter = numberValue(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (resetAfter !== null && resetAfter > 0) {
    return formatUnixSeconds(Math.floor(Date.now() / 1000 + resetAfter));
  }
  return undefined;
}

function planLabel(provider: QuotaLookupProvider, rawPlan: string | null): string | null {
  if (!rawPlan) {
    return null;
  }
  const plan = rawPlan.toLowerCase();
  const labels: Record<string, string> = {
    plan_free: "Free",
    plan_pro: "Pro",
    plan_max: "Max",
    plan_team: "Team",
    free: "Free",
    plus: "Plus",
    pro: "Pro",
    team: "Team",
    enterprise: "Enterprise",
    "free-tier": "Free",
    "legacy-tier": "Legacy",
    "standard-tier": "Standard",
    "g1-pro-tier": "Google One Pro",
    "g1-ultra-tier": "Google One Ultra",
  };
  return labels[plan] ?? (provider === "codex" ? rawPlan.toUpperCase() : rawPlan);
}

function resolveClaudePlan(profile: JsonObject | null): string | null {
  if (!profile) {
    return null;
  }
  const account = isRecord(profile.account) ? profile.account : null;
  const organization = isRecord(profile.organization) ? profile.organization : null;
  if (account?.has_claude_max === true) {
    return "plan_max";
  }
  if (account?.has_claude_pro === true) {
    return "plan_pro";
  }
  const organizationType = stringValue(organization?.organization_type)?.toLowerCase();
  const subscriptionStatus = stringValue(organization?.subscription_status)?.toLowerCase();
  if (organizationType === "claude_team" && subscriptionStatus === "active") {
    return "plan_team";
  }
  if (account?.has_claude_max === false && account?.has_claude_pro === false) {
    return "plan_free";
  }
  return null;
}

async function fetchClaudeQuota(file: AuthFile): Promise<RealQuotaResult> {
  const index = requireAuthIndex(file);
  const [usageResult, profileResult] = await Promise.allSettled([
    checkedApiCall(index, "GET", CLAUDE_USAGE_URL, { ...CLAUDE_REQUEST_HEADERS }),
    checkedApiCall(index, "GET", CLAUDE_PROFILE_URL, { ...CLAUDE_REQUEST_HEADERS }),
  ]);

  if (usageResult.status === "rejected") {
    throw usageResult.reason;
  }

  const payload = payloadRecord(apiPayload(usageResult.value));
  if (!payload) {
    throw new Error("Claude 没有返回可识别的配额数据");
  }

  const metrics: RealQuotaMetric[] = CLAUDE_USAGE_WINDOW_KEYS.flatMap(({ key, id, label }) => {
    const window = isRecord(payload[key]) ? payload[key] : null;
    if (!window || !("utilization" in window)) {
      return [];
    }
    const usedPercent = numberValue(window.utilization);
    return [
      {
        id,
        label,
        percent: remainingFromUsed(usedPercent),
        reset: formatDateTime(stringValue(window.resets_at) ?? undefined),
      },
    ];
  });

  const extra = isRecord(payload.extra_usage) ? payload.extra_usage : null;
  if (extra?.is_enabled === true) {
    const usedCredits = numberValue(extra.used_credits) ?? 0;
    const monthlyLimit = numberValue(extra.monthly_limit) ?? 0;
    metrics.unshift({
      id: "extra-usage",
      label: "额外用量",
      percent: monthlyLimit > 0 ? clampPercent(100 - (usedCredits / monthlyLimit) * 100) : null,
      amount: `$${(usedCredits / 100).toFixed(2)} / $${(monthlyLimit / 100).toFixed(2)}`,
    });
  }

  const profile =
    profileResult.status === "fulfilled" ? payloadRecord(apiPayload(profileResult.value)) : null;

  return {
    ...baseResult(file, "success"),
    checkedAt: checkedAt(),
    plan: planLabel("claude", resolveClaudePlan(profile)),
    metrics,
    message: metrics.length ? undefined : "Claude 返回为空配额窗口",
  };
}

function resolveCodexAccountId(file: AuthFile): string | null {
  const metadata = metadataRecord(file);
  const attributes = attributesRecord(file);
  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  for (const candidate of candidates) {
    const payload = parseIdTokenPayload(candidate);
    const accountId = stringValue(payload?.chatgpt_account_id ?? payload?.chatgptAccountId);
    if (accountId) {
      return accountId;
    }
  }
  return null;
}

function resolveCodexPlan(file: AuthFile): string | null {
  const metadata = metadataRecord(file);
  const attributes = attributesRecord(file);
  const idToken = parseIdTokenPayload(file.id_token);
  const candidates = [
    file.plan_type,
    file.planType,
    idToken?.plan_type,
    idToken?.planType,
    metadata?.plan_type,
    metadata?.planType,
    attributes?.plan_type,
    attributes?.planType,
  ];

  for (const candidate of candidates) {
    const value = stringValue(candidate);
    if (value) {
      return value.toLowerCase();
    }
  }
  return null;
}

function addCodexMetric(
  metrics: RealQuotaMetric[],
  id: string,
  label: string,
  windowValue: unknown,
  limitInfo: JsonObject | null,
) {
  const window = isRecord(windowValue) ? windowValue : null;
  if (!window) {
    return;
  }
  const limitReached = limitInfo?.limit_reached === true || limitInfo?.limitReached === true;
  const allowed = limitInfo?.allowed;
  const usedRaw = numberValue(window.used_percent ?? window.usedPercent);
  const usedPercent = usedRaw ?? (limitReached || allowed === false ? 100 : null);
  metrics.push({
    id,
    label,
    percent: remainingFromUsed(usedPercent),
    reset: formatCodexReset(window),
  });
}

function classifiedCodexWindows(limitInfo: JsonObject | null): {
  fiveHourWindow: JsonObject | null;
  weeklyWindow: JsonObject | null;
} {
  const primaryWindow = isRecord(limitInfo?.primary_window)
    ? limitInfo?.primary_window
    : isRecord(limitInfo?.primaryWindow)
      ? limitInfo?.primaryWindow
      : null;
  const secondaryWindow = isRecord(limitInfo?.secondary_window)
    ? limitInfo?.secondary_window
    : isRecord(limitInfo?.secondaryWindow)
      ? limitInfo?.secondaryWindow
      : null;
  const rawWindows = [primaryWindow, secondaryWindow];
  let fiveHourWindow: JsonObject | null = null;
  let weeklyWindow: JsonObject | null = null;

  for (const window of rawWindows) {
    if (!window) {
      continue;
    }
    const seconds = numberValue(window.limit_window_seconds ?? window.limitWindowSeconds);
    if (seconds === 18000 && !fiveHourWindow) {
      fiveHourWindow = window;
    } else if (seconds === 604800 && !weeklyWindow) {
      weeklyWindow = window;
    }
  }

  return {
    fiveHourWindow: fiveHourWindow ?? (primaryWindow !== weeklyWindow ? primaryWindow : null),
    weeklyWindow: weeklyWindow ?? (secondaryWindow !== fiveHourWindow ? secondaryWindow : null),
  };
}

function buildCodexMetrics(payload: JsonObject): RealQuotaMetric[] {
  const metrics: RealQuotaMetric[] = [];
  const rateLimit = isRecord(payload.rate_limit)
    ? payload.rate_limit
    : isRecord(payload.rateLimit)
      ? payload.rateLimit
      : null;
  const codeReviewLimit = isRecord(payload.code_review_rate_limit)
    ? payload.code_review_rate_limit
    : isRecord(payload.codeReviewRateLimit)
      ? payload.codeReviewRateLimit
      : null;

  const rateWindows = classifiedCodexWindows(rateLimit);
  addCodexMetric(metrics, "code-five-hour", "代码 5 小时", rateWindows.fiveHourWindow, rateLimit);
  addCodexMetric(metrics, "code-weekly", "代码 7 天", rateWindows.weeklyWindow, rateLimit);

  const reviewWindows = classifiedCodexWindows(codeReviewLimit);
  addCodexMetric(metrics, "review-five-hour", "评审 5 小时", reviewWindows.fiveHourWindow, codeReviewLimit);
  addCodexMetric(metrics, "review-weekly", "评审 7 天", reviewWindows.weeklyWindow, codeReviewLimit);

  const additional = Array.isArray(payload.additional_rate_limits)
    ? payload.additional_rate_limits
    : Array.isArray(payload.additionalRateLimits)
      ? payload.additionalRateLimits
      : [];

  additional.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const limitInfo = isRecord(item.rate_limit)
      ? item.rate_limit
      : isRecord(item.rateLimit)
        ? item.rateLimit
        : null;
    if (!limitInfo) {
      return;
    }
    const name =
      stringValue(item.limit_name ?? item.limitName) ??
      stringValue(item.metered_feature ?? item.meteredFeature) ??
      `附加 ${index + 1}`;
    const windows = classifiedCodexWindows(limitInfo);
    addCodexMetric(metrics, `additional-${index}-five-hour`, `${name} 5 小时`, windows.fiveHourWindow, limitInfo);
    addCodexMetric(metrics, `additional-${index}-weekly`, `${name} 7 天`, windows.weeklyWindow, limitInfo);
  });

  return metrics;
}

async function fetchCodexQuota(file: AuthFile): Promise<RealQuotaResult> {
  const index = requireAuthIndex(file);
  const accountId = resolveCodexAccountId(file);
  if (!accountId) {
    throw new Error("缺少 ChatGPT Account ID，当前后端未返回该账号的 id_token 声明");
  }

  const result = await checkedApiCall(index, "GET", CODEX_USAGE_URL, {
    ...CODEX_REQUEST_HEADERS,
    "Chatgpt-Account-Id": accountId,
  });
  const payload = payloadRecord(apiPayload(result));
  if (!payload) {
    throw new Error("Codex 没有返回可识别的配额数据");
  }

  const planFromUsage = stringValue(payload.plan_type ?? payload.planType)?.toLowerCase() ?? null;

  return {
    ...baseResult(file, "success"),
    checkedAt: checkedAt(),
    plan: planLabel("codex", planFromUsage ?? resolveCodexPlan(file)),
    metrics: buildCodexMetrics(payload),
  };
}

function normalizeGeminiModelId(value: unknown): string | null {
  const modelId = stringValue(value);
  if (!modelId) {
    return null;
  }
  return modelId.endsWith("_vertex") ? modelId.slice(0, -"_vertex".length) : modelId;
}

function pickEarlierReset(current?: string, next?: string): string | undefined {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  const currentTime = new Date(current).getTime();
  const nextTime = new Date(next).getTime();
  if (Number.isNaN(currentTime)) {
    return next;
  }
  if (Number.isNaN(nextTime)) {
    return current;
  }
  return currentTime <= nextTime ? current : next;
}

function minNullable(current: number | null, next: number | null): number | null {
  if (current === null) {
    return next;
  }
  if (next === null) {
    return current;
  }
  return Math.min(current, next);
}

function buildGeminiMetrics(buckets: GeminiBucket[]): RealQuotaMetric[] {
  type Group = {
    id: string;
    groupId: string;
    label: string;
    tokenType: string | null;
    modelIds: string[];
    preferredModelId?: string;
    preferredBucket?: GeminiBucket;
    fallbackFraction: number | null;
    fallbackAmount: number | null;
    fallbackReset?: string;
  };
  const grouped = new Map<string, Group>();

  buckets.forEach((bucket) => {
    if (bucket.modelId === "gemini-2.0-flash" || bucket.modelId.startsWith("gemini-2.0-flash-")) {
      return;
    }
    const definition = GEMINI_CLI_GROUP_LOOKUP.get(bucket.modelId);
    const groupId = definition?.id ?? bucket.modelId;
    const tokenKey = bucket.tokenType ?? "";
    const mapKey = `${groupId}::${tokenKey}`;
    const existing = grouped.get(mapKey);
    if (!existing) {
      grouped.set(mapKey, {
        id: `${groupId}${tokenKey ? `-${tokenKey}` : ""}`,
        groupId,
        label: definition?.label ?? bucket.modelId,
        tokenType: bucket.tokenType,
        modelIds: [bucket.modelId],
        preferredModelId: definition?.preferredModelId,
        preferredBucket: definition?.preferredModelId === bucket.modelId ? bucket : undefined,
        fallbackFraction: bucket.remainingFraction,
        fallbackAmount: bucket.remainingAmount,
        fallbackReset: bucket.resetTime,
      });
      return;
    }
    existing.modelIds.push(bucket.modelId);
    existing.fallbackFraction = minNullable(existing.fallbackFraction, bucket.remainingFraction);
    existing.fallbackAmount = minNullable(existing.fallbackAmount, bucket.remainingAmount);
    existing.fallbackReset = pickEarlierReset(existing.fallbackReset, bucket.resetTime);
    if (existing.preferredModelId === bucket.modelId) {
      existing.preferredBucket = bucket;
    }
  });

  return Array.from(grouped.values())
    .sort((left, right) => {
      const leftOrder = GEMINI_CLI_GROUP_ORDER.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = GEMINI_CLI_GROUP_ORDER.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.label.localeCompare(right.label);
    })
    .map((group) => {
      const selected = group.preferredBucket;
      const remainingFraction = selected?.remainingFraction ?? group.fallbackFraction;
      const remainingAmount = selected?.remainingAmount ?? group.fallbackAmount;
      const resetTime = selected?.resetTime ?? group.fallbackReset;
      return {
        id: group.id,
        label: group.label,
        percent: remainingFromFraction(remainingFraction),
        amount: remainingAmount === null ? undefined : `剩余 ${remainingAmount}`,
        reset: formatDateTime(resetTime),
        note: group.tokenType ? `${group.tokenType} · ${Array.from(new Set(group.modelIds)).join(", ")}` : Array.from(new Set(group.modelIds)).join(", "),
      };
    });
}

function extractGeminiProjectId(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) {
    return null;
  }
  const matches = Array.from(raw.matchAll(/\(([^()]+)\)/g));
  if (matches.length > 0) {
    return matches[matches.length - 1]?.[1]?.trim() || null;
  }
  return null;
}

function resolveGeminiProjectId(file: AuthFile): string | null {
  const metadata = metadataRecord(file);
  const attributes = attributesRecord(file);
  const direct =
    stringValue(fileRecord(file).project_id ?? fileRecord(file).projectId) ??
    stringValue(metadata?.project_id ?? metadata?.projectId) ??
    stringValue(attributes?.project_id ?? attributes?.projectId);
  if (direct) {
    return direct;
  }
  return extractGeminiProjectId(file.account) ?? extractGeminiProjectId(metadata?.account ?? attributes?.account);
}

function resolveGeminiTier(payload: JsonObject | null): { tier: string | null; credit: number | null } {
  if (!payload) {
    return { tier: null, credit: null };
  }
  const currentTier = isRecord(payload.currentTier)
    ? payload.currentTier
    : isRecord(payload.current_tier)
      ? payload.current_tier
      : null;
  const paidTier = isRecord(payload.paidTier)
    ? payload.paidTier
    : isRecord(payload.paid_tier)
      ? payload.paid_tier
      : null;
  const tier = paidTier ?? currentTier;
  const credits = Array.isArray(tier?.availableCredits)
    ? tier?.availableCredits
    : Array.isArray(tier?.available_credits)
      ? tier?.available_credits
      : [];
  let creditTotal = 0;
  let hasCredit = false;
  credits.forEach((credit) => {
    if (!isRecord(credit)) {
      return;
    }
    const creditType = stringValue(credit.creditType ?? credit.credit_type);
    if (creditType !== "GOOGLE_ONE_AI") {
      return;
    }
    const amount = numberValue(credit.creditAmount ?? credit.credit_amount);
    if (amount !== null) {
      creditTotal += amount;
      hasCredit = true;
    }
  });
  return {
    tier: stringValue(tier?.id ?? tier?.name),
    credit: hasCredit ? creditTotal : null,
  };
}

async function fetchGeminiCliQuota(file: AuthFile): Promise<RealQuotaResult> {
  const index = requireAuthIndex(file);
  const projectId = resolveGeminiProjectId(file);
  if (!projectId) {
    throw new Error("缺少 Gemini CLI 项目 ID，无法查询配额");
  }

  const quotaResponse = await checkedApiCall(index, "POST", GEMINI_CLI_QUOTA_URL, {
    ...GEMINI_CLI_REQUEST_HEADERS,
  }, JSON.stringify({ project: projectId }));
  const payload = payloadRecord(apiPayload(quotaResponse));
  if (!payload) {
    throw new Error("Gemini CLI 没有返回可识别的配额数据");
  }

  const buckets = Array.isArray(payload.buckets)
    ? payload.buckets.flatMap((bucket): GeminiBucket[] => {
        if (!isRecord(bucket)) {
          return [];
        }
        const modelId = normalizeGeminiModelId(bucket.modelId ?? bucket.model_id);
        if (!modelId) {
          return [];
        }
        const remainingAmount = numberValue(bucket.remainingAmount ?? bucket.remaining_amount);
        const resetTime = stringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
        const remainingFraction =
          quotaFraction(bucket.remainingFraction ?? bucket.remaining_fraction) ??
          (remainingAmount !== null && remainingAmount <= 0 ? 0 : resetTime ? 0 : null);
        return [
          {
            modelId,
            tokenType: stringValue(bucket.tokenType ?? bucket.token_type),
            remainingFraction,
            remainingAmount,
            resetTime,
          },
        ];
      })
    : [];

  const assistResult = await checkedApiCall(index, "POST", GEMINI_CLI_CODE_ASSIST_URL, {
    ...GEMINI_CLI_REQUEST_HEADERS,
  }, JSON.stringify({
    cloudaicompanionProject: projectId,
    metadata: {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
      duetProject: projectId,
    },
  })).catch(() => null);

  const tier = resolveGeminiTier(assistResult ? payloadRecord(apiPayload(assistResult)) : null);
  const planParts = [planLabel("gemini-cli", tier.tier)];
  if (tier.credit !== null) {
    planParts.push(`Google One Credits ${tier.credit}`);
  }

  return {
    ...baseResult(file, "success"),
    checkedAt: checkedAt(),
    plan: planParts.filter(Boolean).join(" · ") || null,
    metrics: buildGeminiMetrics(buckets),
  };
}

function antigravityQuotaInfo(entry: JsonObject | null): {
  remainingFraction: number | null;
  resetTime?: string;
  displayName?: string;
} {
  if (!entry) {
    return { remainingFraction: null };
  }
  const quotaInfo = isRecord(entry.quotaInfo)
    ? entry.quotaInfo
    : isRecord(entry.quota_info)
      ? entry.quota_info
      : {};
  return {
    remainingFraction: quotaFraction(
      quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining,
    ),
    resetTime: stringValue(quotaInfo.resetTime ?? quotaInfo.reset_time) ?? undefined,
    displayName: stringValue(entry.displayName) ?? undefined,
  };
}

function findAntigravityModel(models: JsonObject, identifier: string): { id: string; entry: JsonObject } | null {
  const direct = models[identifier];
  if (isRecord(direct)) {
    return { id: identifier, entry: direct };
  }
  for (const [id, entry] of Object.entries(models)) {
    if (!isRecord(entry)) {
      continue;
    }
    const name = stringValue(entry.displayName)?.toLowerCase();
    if (name === identifier.toLowerCase()) {
      return { id, entry };
    }
  }
  return null;
}

function buildAntigravityMetrics(models: JsonObject): RealQuotaMetric[] {
  const definitions: Map<string, AntigravityGroupDefinition> = new Map(
    ANTIGRAVITY_QUOTA_GROUPS.map((definition) => [definition.id, definition] as const),
  );
  const output: RealQuotaMetric[] = [];

  const append = (id: string, overrideReset?: string): { metric: RealQuotaMetric; resetTime?: string } | null => {
    const definition = definitions.get(id);
    if (!definition) {
      return null;
    }
    const entries = definition.identifiers
      .map((identifier) => findAntigravityModel(models, identifier))
      .flatMap((match) => {
        if (!match) {
          return [];
        }
        const info = antigravityQuotaInfo(match.entry);
        const fraction = info.remainingFraction ?? (info.resetTime ? 0 : null);
        return fraction === null
          ? []
          : [{ id: match.id, fraction, resetTime: info.resetTime, displayName: info.displayName }];
      });
    if (entries.length === 0) {
      return null;
    }
    const displayName = entries.find((entry) => entry.displayName)?.displayName;
    const resetTime = overrideReset ?? entries.find((entry) => entry.resetTime)?.resetTime;
    const metric = {
      id: definition.id,
      label: definition.labelFromModel && displayName ? displayName : definition.label,
      percent: remainingFromFraction(Math.min(...entries.map((entry) => entry.fraction))),
      reset: formatDateTime(resetTime),
      note: entries.map((entry) => entry.id).join(", "),
    };
    output.push(metric);
    return { metric, resetTime };
  };

  append("claude-gpt");
  const gemini31Pro = append("gemini-3-1-pro-series");
  const gemini3Pro = append("gemini-3-pro");
  const geminiProReset = gemini31Pro?.resetTime ?? gemini3Pro?.resetTime;
  append("gemini-2-5-flash");
  append("gemini-2-5-flash-lite");
  append("gemini-2-5-cu");
  append("gemini-3-flash");
  append("gemini-image", geminiProReset);

  return output;
}

async function resolveAntigravityProjectId(file: AuthFile): Promise<string> {
  const direct =
    stringValue(fileRecord(file).project_id ?? fileRecord(file).projectId) ??
    stringValue(metadataRecord(file)?.project_id ?? metadataRecord(file)?.projectId);
  if (direct) {
    return direct;
  }

  try {
    const blob = await managementApi.downloadAuthFile(file.name);
    const text = await blob.text();
    const parsed = payloadRecord(text);
    if (!parsed) {
      return DEFAULT_ANTIGRAVITY_PROJECT_ID;
    }
    const topLevel = stringValue(parsed.project_id ?? parsed.projectId);
    if (topLevel) {
      return topLevel;
    }
    const installed = isRecord(parsed.installed) ? parsed.installed : null;
    const installedProject = stringValue(installed?.project_id ?? installed?.projectId);
    if (installedProject) {
      return installedProject;
    }
    const web = isRecord(parsed.web) ? parsed.web : null;
    return stringValue(web?.project_id ?? web?.projectId) ?? DEFAULT_ANTIGRAVITY_PROJECT_ID;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }
}

async function fetchAntigravityQuota(file: AuthFile): Promise<RealQuotaResult> {
  const index = requireAuthIndex(file);
  const projectId = await resolveAntigravityProjectId(file);
  let lastError = "";
  let lastStatus: number | undefined;
  let hadSuccess = false;

  for (const url of ANTIGRAVITY_QUOTA_URLS) {
    try {
      const result = await checkedApiCall(index, "POST", url, { ...ANTIGRAVITY_REQUEST_HEADERS }, JSON.stringify({ project: projectId }));
      hadSuccess = true;
      const payload = payloadRecord(apiPayload(result));
      const nestedPayload = payloadRecord(payload?.body) ?? payload;
      const models = isRecord(nestedPayload?.models) ? nestedPayload?.models : null;
      if (!models) {
        lastError = "Antigravity 返回为空模型配额";
        continue;
      }
      const metrics = buildAntigravityMetrics(models);
      if (metrics.length === 0) {
        lastError = "Antigravity 返回为空模型配额";
        continue;
      }
      return {
        ...baseResult(file, "success"),
        checkedAt: checkedAt(),
        plan: projectId,
        metrics,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Antigravity 配额查询失败";
      lastStatus = statusFromError(error);
    }
  }

  if (hadSuccess) {
    return {
      ...baseResult(file, "success"),
      checkedAt: checkedAt(),
      plan: projectId,
      metrics: [],
      message: "Antigravity 返回为空模型配额",
    };
  }

  throw createStatusError(lastError || "Antigravity 配额查询失败", lastStatus);
}

function kimiResetHint(data: JsonObject): string | undefined {
  for (const key of ["reset_at", "resetAt", "reset_time", "resetTime"]) {
    const raw = stringValue(data[key]);
    if (!raw) {
      continue;
    }
    const date = new Date(raw.replace(/(\.\d{6})\d+/, "$1"));
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    const delta = date.getTime() - Date.now();
    if (delta <= 0) {
      return undefined;
    }
    return formatDuration(delta / 1000);
  }

  for (const key of ["reset_in", "resetIn", "ttl"]) {
    const seconds = intValue(data[key]);
    if (seconds !== null && seconds > 0) {
      return formatDuration(seconds);
    }
  }

  return undefined;
}

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m 后`;
  }
  if (hours > 0) {
    return `${hours}h 后`;
  }
  if (minutes > 0) {
    return `${minutes}m 后`;
  }
  return "<1m 后";
}

function kimiDurationToken(duration: number, rawUnit: unknown): string {
  const unit = stringValue(rawUnit)?.toUpperCase() ?? "";
  if (unit === "MINUTES") {
    return duration % 60 === 0 ? `${duration / 60}h` : `${duration}m`;
  }
  if (unit === "HOURS") {
    return `${duration}h`;
  }
  if (unit === "DAYS") {
    return `${duration}d`;
  }
  return `${duration}s`;
}

function buildKimiMetric(data: JsonObject, fallbackLabel: string, id: string): RealQuotaMetric | null {
  const limit = intValue(data.limit);
  let used = intValue(data.used);
  const remaining = intValue(data.remaining);
  if (used === null && remaining !== null && limit !== null) {
    used = limit - remaining;
  }
  if (used === null && limit === null) {
    return null;
  }
  const label = stringValue(data.name ?? data.title) ?? fallbackLabel;
  const safeUsed = used ?? 0;
  const safeLimit = limit ?? 0;
  return {
    id,
    label,
    percent: safeLimit > 0 ? clampPercent(((safeLimit - safeUsed) / safeLimit) * 100) : safeUsed > 0 ? 0 : null,
    amount: safeLimit > 0 ? `${safeUsed} / ${safeLimit}` : String(safeUsed),
    reset: kimiResetHint(data),
  };
}

function buildKimiMetrics(payload: JsonObject): RealQuotaMetric[] {
  const metrics: RealQuotaMetric[] = [];
  if (isRecord(payload.usage)) {
    const metric = buildKimiMetric(payload.usage, "周额度", "summary");
    if (metric) {
      metrics.push(metric);
    }
  }

  const limits = Array.isArray(payload.limits) ? payload.limits : [];
  limits.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const detail = isRecord(item.detail) ? item.detail : item;
    const window = isRecord(item.window) ? item.window : {};
    const duration = intValue(window.duration ?? item.duration ?? detail.duration);
    const fallbackLabel = duration === null
      ? `限制 ${index + 1}`
      : `窗口 ${kimiDurationToken(duration, window.timeUnit ?? item.timeUnit ?? detail.timeUnit)}`;
    const metric = buildKimiMetric(detail, fallbackLabel, `limit-${index}`);
    if (metric) {
      metrics.push(metric);
    }
  });

  return metrics;
}

async function fetchKimiQuota(file: AuthFile): Promise<RealQuotaResult> {
  const index = requireAuthIndex(file);
  const result = await checkedApiCall(index, "GET", KIMI_USAGE_URL, { ...KIMI_REQUEST_HEADERS });
  const payload = payloadRecord(apiPayload(result));
  if (!payload) {
    throw new Error("Kimi 没有返回可识别的配额数据");
  }

  return {
    ...baseResult(file, "success"),
    checkedAt: checkedAt(),
    metrics: buildKimiMetrics(payload),
  };
}

export function quotaLookupKey(file: AuthFile): string {
  return file.id ?? file.name;
}

export function quotaProvider(file: AuthFile): QuotaLookupProvider | null {
  const provider = providerName(file);
  if (
    provider === "antigravity" ||
    provider === "claude" ||
    provider === "codex" ||
    provider === "gemini-cli" ||
    provider === "kimi"
  ) {
    return provider;
  }
  return null;
}

export function supportsRealQuota(file: AuthFile): boolean {
  if (!quotaProvider(file)) {
    return false;
  }
  if (file.disabled || file.runtime_only || file.runtimeOnly === true || file.runtimeOnly === "true") {
    return false;
  }
  return Boolean(authIndex(file));
}

export function buildLoadingQuota(file: AuthFile): RealQuotaResult {
  return {
    ...baseResult(file, "loading"),
    checkedAt: checkedAt(),
    message: "正在查询上游配额",
  };
}

export function buildUnsupportedQuota(file: AuthFile, message = "该账号暂不支持实际配额查询"): RealQuotaResult {
  return {
    ...baseResult(file, "unsupported"),
    checkedAt: checkedAt(),
    message,
  };
}

export function buildQuotaError(file: AuthFile, error: unknown): RealQuotaResult {
  return {
    ...baseResult(file, "error"),
    checkedAt: checkedAt(),
    message: error instanceof Error ? error.message : "配额查询失败",
    statusCode: statusFromError(error),
  };
}

export async function fetchRealQuota(file: AuthFile): Promise<RealQuotaResult> {
  const provider = quotaProvider(file);
  if (!provider) {
    return buildUnsupportedQuota(file);
  }
  if (!supportsRealQuota(file)) {
    return buildUnsupportedQuota(file, "缺少 auth_index，或账号已停用 / 仅运行时存在");
  }

  switch (provider) {
    case "antigravity":
      return fetchAntigravityQuota(file);
    case "claude":
      return fetchClaudeQuota(file);
    case "codex":
      return fetchCodexQuota(file);
    case "gemini-cli":
      return fetchGeminiCliQuota(file);
    case "kimi":
      return fetchKimiQuota(file);
  }
}
