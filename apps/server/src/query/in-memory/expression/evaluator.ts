/**
 * Evaluates parsed expressions against rows. Two entry points:
 *  - evaluate(): scalar, per-row (addColumn / replaceColumn / filter modes)
 *  - evaluateAggregate(): reduces a group of rows to one value; the tree may
 *    contain aggregate calls whose inner expressions run per row, with
 *    scalar arithmetic around them evaluated on the reduced values.
 */

import type { Row } from '../../../datasets/dataset-provider';
import { AGGREGATE_FNS, ExpressionError, type ExprNode } from './parser';

export type Params = Record<string, string | number | boolean | null>;

type Value = unknown;

function asNumber(v: Value, context: string): number {
  if (v === null || v === undefined) return NaN;
  const n = Number(v);
  if (Number.isNaN(n)) throw new ExpressionError(`${context}: "${String(v)}" is not a number`);
  return n;
}

function asDate(v: Value): Date {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new ExpressionError(`Not a date: "${String(v)}"`);
  return d;
}

function truthy(v: Value): boolean {
  return v !== null && v !== undefined && v !== false && v !== 0 && v !== '';
}

function compare(op: string, l: Value, r: Value): boolean {
  if (l === null || r === null || l === undefined || r === undefined) {
    // SQL-like: comparisons with null are false (except != of non-null)
    return op === '!=' ? l !== r : false;
  }
  if (typeof l === 'number' || typeof r === 'number') {
    const ln = Number(l);
    const rn = Number(r);
    switch (op) {
      case '=': return ln === rn;
      case '!=': return ln !== rn;
      case '<': return ln < rn;
      case '<=': return ln <= rn;
      case '>': return ln > rn;
      case '>=': return ln >= rn;
    }
  }
  const ls = String(l);
  const rs = String(r);
  switch (op) {
    case '=': return ls === rs;
    case '!=': return ls !== rs;
    case '<': return ls < rs;
    case '<=': return ls <= rs;
    case '>': return ls > rs;
    default: throw new ExpressionError(`Unknown comparison: ${op}`);
  }
}

function callScalar(fn: string, args: Value[]): Value {
  switch (fn) {
    case 'upper': return String(args[0] ?? '').toUpperCase();
    case 'lower': return String(args[0] ?? '').toLowerCase();
    case 'length': return String(args[0] ?? '').length;
    case 'concat': return args.map((a) => (a === null || a === undefined ? '' : String(a))).join('');
    case 'abs': return Math.abs(asNumber(args[0], 'abs'));
    case 'round': {
      const digits = args.length > 1 ? asNumber(args[1], 'round') : 0;
      const factor = 10 ** digits;
      return Math.round(asNumber(args[0], 'round') * factor) / factor;
    }
    case 'floor': return Math.floor(asNumber(args[0], 'floor'));
    case 'ceil': return Math.ceil(asNumber(args[0], 'ceil'));
    case 'coalesce': return args.find((a) => a !== null && a !== undefined) ?? null;
    case 'if': return truthy(args[0]) ? args[1] : args[2] ?? null;
    case 'year': return asDate(args[0]).getUTCFullYear();
    case 'month': return asDate(args[0]).getUTCMonth() + 1;
    case 'day': return asDate(args[0]).getUTCDate();
    case 'hour': return asDate(args[0]).getUTCHours();
    default: throw new ExpressionError(`Unknown function: ${fn}`);
  }
}

export function evaluate(node: ExprNode, row: Row, params: Params): Value {
  switch (node.t) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'bool': return node.v;
    case 'null': return null;
    case 'param': {
      if (!(node.name in params)) {
        throw new ExpressionError(`__PARAM_MISSING__${node.name}`);
      }
      return params[node.name];
    }
    case 'col': {
      if (!(node.name in row)) {
        throw new ExpressionError(`Unknown column: ${node.name}`);
      }
      return row[node.name];
    }
    case 'un':
      return node.op === '-'
        ? -asNumber(evaluate(node.operand, row, params), 'negation')
        : !truthy(evaluate(node.operand, row, params));
    case 'bin': {
      const { op } = node;
      if (op === 'and') {
        return truthy(evaluate(node.left, row, params)) && truthy(evaluate(node.right, row, params));
      }
      if (op === 'or') {
        return truthy(evaluate(node.left, row, params)) || truthy(evaluate(node.right, row, params));
      }
      const l = evaluate(node.left, row, params);
      const r = evaluate(node.right, row, params);
      switch (op) {
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return String(l) + String(r);
          return asNumber(l, '+') + asNumber(r, '+');
        case '-': return asNumber(l, '-') - asNumber(r, '-');
        case '*': return asNumber(l, '*') * asNumber(r, '*');
        case '/': {
          const divisor = asNumber(r, '/');
          return divisor === 0 ? null : asNumber(l, '/') / divisor;
        }
        case '%': return asNumber(l, '%') % asNumber(r, '%');
        default: return compare(op, l, r);
      }
    }
    case 'call': {
      if (AGGREGATE_FNS.has(node.fn)) {
        throw new ExpressionError(
          `Aggregate function ${node.fn}() is only allowed in aggregate expressions`,
        );
      }
      const args = node.args.map((a) => evaluate(a, row, params));
      return callScalar(node.fn, args);
    }
  }
}

export function reduceAggregate(fn: string, values: Value[]): Value {
  const defined = values.filter((v) => v !== null && v !== undefined);
  switch (fn) {
    case 'count': return values.length;
    case 'count_distinct': return new Set(defined.map((v) => String(v))).size;
    case 'sum': return defined.reduce<number>((s, v) => s + Number(v), 0);
    case 'avg':
      return defined.length === 0
        ? null
        : defined.reduce<number>((s, v) => s + Number(v), 0) / defined.length;
    case 'min':
      return defined.length === 0
        ? null
        : defined.reduce((m, v) => (compare('<', v, m) ? v : m));
    case 'max':
      return defined.length === 0
        ? null
        : defined.reduce((m, v) => (compare('>', v, m) ? v : m));
    case 'median': {
      if (defined.length === 0) return null;
      const sorted = defined.map(Number).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case 'stddev':
    case 'variance': {
      if (defined.length < 2) return null;
      const nums = defined.map(Number);
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
      const variance =
        nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1);
      return fn === 'variance' ? variance : Math.sqrt(variance);
    }
    default:
      throw new ExpressionError(`Unknown aggregate: ${fn}`);
  }
}

/**
 * Evaluates an aggregate-mode expression over a group of rows. Aggregate
 * calls reduce their inner expression across the group; everything outside
 * them is scalar arithmetic over the reduced values (e.g.
 * `sum(revenue) / count()` works).
 */
export function evaluateAggregate(
  node: ExprNode,
  rows: Row[],
  params: Params,
): Value {
  switch (node.t) {
    case 'call':
      if (AGGREGATE_FNS.has(node.fn)) {
        if (node.fn === 'count' && node.args.length === 0) {
          return rows.length;
        }
        const inner = node.args[0];
        if (!inner) throw new ExpressionError(`${node.fn}() requires an argument`);
        const values = rows.map((row) => evaluate(inner, row, params));
        return reduceAggregate(node.fn, values);
      }
      return callScalar(
        node.fn,
        node.args.map((a) => evaluateAggregate(a, rows, params)),
      );
    case 'bin': {
      const scalarRow: Row = {};
      const rewritten: ExprNode = {
        t: 'bin',
        op: node.op,
        left: liftToScalar(node.left, rows, params),
        right: liftToScalar(node.right, rows, params),
      };
      return evaluate(rewritten, scalarRow, params);
    }
    case 'un':
      return evaluate(
        { t: 'un', op: node.op, operand: liftToScalar(node.operand, rows, params) },
        {},
        params,
      );
    default:
      // Bare column/literal in aggregate context → evaluate on first row
      // (columns here should be group-by keys, constant within the group).
      return evaluate(node, rows[0] ?? {}, params);
  }
}

/** Replaces aggregate subtrees with their computed literal values. */
function liftToScalar(node: ExprNode, rows: Row[], params: Params): ExprNode {
  const value = evaluateAggregate(node, rows, params);
  if (value === null || value === undefined) return { t: 'null' };
  if (typeof value === 'number') return { t: 'num', v: value };
  if (typeof value === 'boolean') return { t: 'bool', v: value };
  return { t: 'str', v: String(value) };
}
