export const DEFAULT_MAX_PARSE_DEPTH = 20;
export const createParseRuntimeContext = (context, options) => {
    if (context) {
        return context;
    }
    return {
        depth: 0,
        maxDepth: options?.maxDepth ?? DEFAULT_MAX_PARSE_DEPTH,
        seen: new WeakSet(),
        options: options ?? {},
    };
};
export const createChildParseRuntimeContext = (context) => {
    return {
        depth: context.depth + 1,
        maxDepth: context.maxDepth,
        seen: context.seen,
        options: context.options,
    };
};
export const parseWithOptions = (schema, input, path = "/", options = {}) => {
    return schema.parse(input, path, createParseRuntimeContext(undefined, options));
};
