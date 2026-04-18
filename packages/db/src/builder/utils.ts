export const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const CONTROL_CHARS_REGEX = /[\0\n\r\t\x08\x1a]/;

export const ALLOWED_OPERATORS = new Set([
  "=", "!=", "<", "<=", ">", ">=", "LIKE", "ILIKE", "IN", "NOT IN", "IS", "IS NOT", "AND", "OR", "||"
]);

export const ALLOWED_FUNCTIONS = new Set([
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "LOWER", "UPPER", "NOW", "DATE", "SUBSTR", "SUBSTRING", "JSON_EXTRACT"
]);

export function validateIdentifier(name: string): void {
  if (typeof name !== "string") {
    throw new Error(`Security Exception: Identifier must be a string, got ${typeof name}`);
  }

  if (CONTROL_CHARS_REGEX.test(name)) {
    throw new Error(`Security Exception: Control characters detected in identifier`);
  }

  // Unicode Homograph Attack prevention:
  // Normalize to NFKC and check if it still matches the strict ASCII regex.
  // This prevents cases where a character might be normalized into a quote or semicolon.
  const normalized = name.normalize("NFKC");
  if (normalized !== name) {
    throw new Error(`Security Exception: Potential Unicode normalization bypass detected in identifier "${name}"`);
  }

  if (!IDENTIFIER_REGEX.test(normalized)) {
    throw new Error(`Security Exception: Invalid identifier "${name}". Only alphanumeric and underscores are allowed (ASCII only).`);
  }
}

export function validateOperator(operator: string): string {
  const upperOp = operator.toUpperCase();
  if (!ALLOWED_OPERATORS.has(upperOp)) {
    throw new Error(`Security Exception: Disallowed SQL operator "${operator}"`);
  }
  return upperOp;
}

export function validateFunctionName(name: string): string {
  const upperName = name.toUpperCase();
  if (!ALLOWED_FUNCTIONS.has(upperName)) {
    throw new Error(`Security Exception: Disallowed function name "${name}"`);
  }
  return upperName;
}

export function isCircular(obj: any, seen = new WeakSet()): boolean {
  if (obj && typeof obj === 'object') {
    if (seen.has(obj)) return true;
    seen.add(obj);
    for (const key in obj) {
      if (isCircular(obj[key], seen)) return true;
    }
  }
  return false;
}

export function validateExpression(expr: any): void {
  if (!expr || typeof expr !== 'object') {
    throw new Error(`Security Exception: Expression must be an object, got ${typeof expr}`);
  }
  
  if (!expr.type) {
    throw new Error(`Security Exception: Expression must have a type`);
  }

  switch (expr.type) {
    case 'column':
      if (expr.table) validateIdentifier(expr.table);
      validateIdentifier(expr.name);
      break;
    case 'binary':
      validateOperator(expr.operator);
      validateExpression(expr.left);
      validateExpression(expr.right);
      break;
    case 'literal':
      if (isCircular(expr.value)) {
        throw new Error("Security Exception: Circular reference detected in literal value");
      }
      break;
    case 'function':
      validateFunctionName(expr.name);
      if (expr.args) {
        expr.args.forEach((arg: any) => validateExpression(arg));
      }
      break;
    default:
      throw new Error(`Security Exception: Unsupported expression type: ${expr.type}`);
  }
}
