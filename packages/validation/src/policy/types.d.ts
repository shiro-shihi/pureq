export type GuardrailRule = {
    name: string;
    params?: Record<string, unknown>;
};
export type ValidationPolicy = {
    redact?: "mask" | "hide" | "none";
    pii?: boolean;
    scope?: string[];
    guardrails?: GuardrailRule[];
    onDenied?: "drop" | "error";
};
