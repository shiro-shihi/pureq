const escapeToken = (token) => {
    return token.replaceAll("~", "~0").replaceAll("/", "~1");
};
const unescapeToken = (token) => {
    return token.replaceAll("~1", "/").replaceAll("~0", "~");
};
export const encodeJsonPointer = (tokens) => {
    if (tokens.length === 0) {
        return "/";
    }
    return `/${tokens.map(escapeToken).join("/")}`;
};
export const decodeJsonPointer = (pointer) => {
    if (pointer === "/") {
        return [];
    }
    if (!pointer.startsWith("/")) {
        return [];
    }
    const rawTokens = pointer.slice(1).split("/");
    return rawTokens.map(unescapeToken);
};
const toTokensFromLoosePath = (path) => {
    const withoutRoot = path.replace(/^\$\.?/, "");
    const withDots = withoutRoot
        .replace(/\[(\d+)\]/g, ".$1")
        .replace(/\[['\"]([^'\"]+)['\"]\]/g, ".$1");
    return withDots
        .split(".")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
};
export const normalizePathToJsonPointer = (path) => {
    if (!path || path.trim().length === 0) {
        return "/";
    }
    const trimmed = path.trim();
    if (trimmed === "/") {
        return "/";
    }
    if (trimmed.startsWith("/")) {
        return encodeJsonPointer(decodeJsonPointer(trimmed));
    }
    return encodeJsonPointer(toTokensFromLoosePath(trimmed));
};
