export const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const CONTROL_CHARS_REGEX = /[\0\n\r\t\x08\x1a]/;

export const ALLOWED_OPERATORS = new Set([
  "=", "!=", "<", "<=", ">", ">=", "LIKE", "ILIKE", "IN", "NOT IN", "IS", "IS NOT", "AND", "OR"
]);

export const ALLOWED_FUNCTIONS = new Set([
  "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "LOWER", "UPPER", "NOW", "DATE"
]);

export function validateIdentifier(name: string): void {
  if (CONTROL_CHARS_REGEX.test(name)) {
    throw new Error(`Security Exception: Control characters detected in identifier`);
  }
  // Strict regex check also effectively blocks NFKC-normalized dangerous chars (like full-width space)
  if (!IDENTIFIER_REGEX.test(name)) {
    throw new Error(`Security Exception: Invalid identifier "${name}". Only alphanumeric and underscores are allowed.`);
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
  if (!expr || typeof expr !== 'object') return;
  
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
  }
}
