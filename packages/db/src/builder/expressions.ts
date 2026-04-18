import type { Expression } from "./ast.js";

export function col(name: string, table?: string): Expression {
  return { type: "column", name, table };
}

export function lit(value: unknown): Expression {
  return { type: "literal", value };
}

function toExpr(val: unknown): Expression {
  if (val && typeof val === "object" && "type" in val) {
    return val as Expression;
  }
  return lit(val);
}

export function eq(left: Expression | string, right: unknown): Expression {
  return {
    type: "binary",
    left: typeof left === "string" ? col(left) : left,
    operator: "=",
    right: toExpr(right),
  };
}

export function ne(left: Expression | string, right: unknown): Expression {
  return {
    type: "binary",
    left: typeof left === "string" ? col(left) : left,
    operator: "!=",
    right: toExpr(right),
  };
}

export function gt(left: Expression | string, right: unknown): Expression {
  return {
    type: "binary",
    left: typeof left === "string" ? col(left) : left,
    operator: ">",
    right: toExpr(right),
  };
}

export function lt(left: Expression | string, right: unknown): Expression {
  return {
    type: "binary",
    left: typeof left === "string" ? col(left) : left,
    operator: "<",
    right: toExpr(right),
  };
}

export function gte(left: Expression | string, right: unknown): Expression {
  return {
    type: "binary",
    left: typeof left === "string" ? col(left) : left,
    operator: ">=",
    right: toExpr(right),
  };
}

export function lte(left: Expression | string, right: unknown): Expression {
  return {
    type: "binary",
    left: typeof left === "string" ? col(left) : left,
    operator: "<=",
    right: toExpr(right),
  };
}

export function and(...exprs: Expression[]): Expression {
  if (exprs.length === 0) return lit(true);
  if (exprs.length === 1) return exprs[0]!;
  return exprs.reduce((acc, curr) => ({
    type: "binary",
    left: acc,
    operator: "AND",
    right: curr,
  }));
}

export function or(...exprs: Expression[]): Expression {
  if (exprs.length === 0) return lit(false);
  if (exprs.length === 1) return exprs[0]!;
  return exprs.reduce((acc, curr) => ({
    type: "binary",
    left: acc,
    operator: "OR",
    right: curr,
  }));
}

export const op = {
  eq,
  ne,
  gt,
  lt,
  gte,
  lte,
  and,
  or,
  col,
  lit,
};
