/**
 * Mini expression language for the expression board.
 *
 * Supported syntax (SQL-flavored):
 *   literals      42, 3.14, 'text', true, false, null
 *   columns       revenue, "unit price"   (double quotes for spaced names)
 *   parameters    $rate_code
 *   arithmetic    + - * / %
 *   comparison    = != <> < <= > >=
 *   boolean       AND OR NOT
 *   grouping      ( ... )
 *   functions     upper lower length concat abs round floor ceil
 *                 coalesce if year month day hour
 *   aggregates    sum avg min max count count_distinct median stddev variance
 *                 (only valid at the top level of aggregate-mode expressions)
 */

export type ExprNode =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'col'; name: string }
  | { t: 'param'; name: string }
  | { t: 'un'; op: '-' | 'not'; operand: ExprNode }
  | { t: 'bin'; op: string; left: ExprNode; right: ExprNode }
  | { t: 'call'; fn: string; args: ExprNode[] };

export const AGGREGATE_FNS = new Set([
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'count_distinct',
  'median',
  'stddev',
  'variance',
]);

export const SCALAR_FNS = new Set([
  'upper',
  'lower',
  'length',
  'concat',
  'abs',
  'round',
  'floor',
  'ceil',
  'coalesce',
  'if',
  'year',
  'month',
  'day',
  'hour',
]);

interface Token {
  kind: 'num' | 'str' | 'ident' | 'param' | 'op' | 'lparen' | 'rparen' | 'comma';
  text: string;
}

export class ExpressionError extends Error {}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen', text: '(' });
      i++;
    } else if (ch === ')') {
      tokens.push({ kind: 'rparen', text: ')' });
      i++;
    } else if (ch === ',') {
      tokens.push({ kind: 'comma', text: ',' });
      i++;
    } else if (ch === "'") {
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== "'") {
        value += src[j];
        j++;
      }
      if (j >= src.length) throw new ExpressionError('Unterminated string literal');
      tokens.push({ kind: 'str', text: value });
      i = j + 1;
    } else if (ch === '"') {
      let j = i + 1;
      let name = '';
      while (j < src.length && src[j] !== '"') {
        name += src[j];
        j++;
      }
      if (j >= src.length) throw new ExpressionError('Unterminated quoted identifier');
      tokens.push({ kind: 'ident', text: name });
      i = j + 1;
    } else if (ch === '$') {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(src.slice(i));
      if (!match) throw new ExpressionError(`Invalid parameter reference at "${src.slice(i, i + 10)}"`);
      tokens.push({ kind: 'param', text: match[1] });
      i += match[0].length;
    } else if (/[0-9]/.test(ch)) {
      const match = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      tokens.push({ kind: 'num', text: match[0] });
      i += match[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      tokens.push({ kind: 'ident', text: match[0] });
      i += match[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '!=', '<>'].includes(two)) {
        tokens.push({ kind: 'op', text: two === '<>' ? '!=' : two });
        i += 2;
      } else if ('+-*/%=<>'.includes(ch)) {
        tokens.push({ kind: 'op', text: ch });
        i++;
      } else {
        throw new ExpressionError(`Unexpected character "${ch}"`);
      }
    }
  }
  return tokens;
}

export function parseExpression(src: string): ExprNode {
  const tokens = tokenize(src);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token => {
    const token = tokens[pos++];
    if (!token) throw new ExpressionError('Unexpected end of expression');
    return token;
  };
  const isKeyword = (token: Token | undefined, word: string): boolean =>
    token?.kind === 'ident' && token.text.toLowerCase() === word;

  function parseOr(): ExprNode {
    let left = parseAnd();
    while (isKeyword(peek(), 'or')) {
      next();
      left = { t: 'bin', op: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): ExprNode {
    let left = parseNot();
    while (isKeyword(peek(), 'and')) {
      next();
      left = { t: 'bin', op: 'and', left, right: parseNot() };
    }
    return left;
  }

  function parseNot(): ExprNode {
    if (isKeyword(peek(), 'not')) {
      next();
      return { t: 'un', op: 'not', operand: parseNot() };
    }
    return parseComparison();
  }

  function parseComparison(): ExprNode {
    const left = parseAdditive();
    const token = peek();
    if (token?.kind === 'op' && ['=', '!=', '<', '<=', '>', '>='].includes(token.text)) {
      next();
      return { t: 'bin', op: token.text, left, right: parseAdditive() };
    }
    return left;
  }

  function parseAdditive(): ExprNode {
    let left = parseMultiplicative();
    let token = peek();
    while (token?.kind === 'op' && (token.text === '+' || token.text === '-')) {
      next();
      left = { t: 'bin', op: token.text, left, right: parseMultiplicative() };
      token = peek();
    }
    return left;
  }

  function parseMultiplicative(): ExprNode {
    let left = parseUnary();
    let token = peek();
    while (token?.kind === 'op' && ['*', '/', '%'].includes(token.text)) {
      next();
      left = { t: 'bin', op: token.text, left, right: parseUnary() };
      token = peek();
    }
    return left;
  }

  function parseUnary(): ExprNode {
    const token = peek();
    if (token?.kind === 'op' && token.text === '-') {
      next();
      return { t: 'un', op: '-', operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): ExprNode {
    const token = next();
    switch (token.kind) {
      case 'num':
        return { t: 'num', v: Number(token.text) };
      case 'str':
        return { t: 'str', v: token.text };
      case 'param':
        return { t: 'param', name: token.text };
      case 'lparen': {
        const inner = parseOr();
        const closing = next();
        if (closing.kind !== 'rparen') throw new ExpressionError('Expected ")"');
        return inner;
      }
      case 'ident': {
        const lower = token.text.toLowerCase();
        if (lower === 'true') return { t: 'bool', v: true };
        if (lower === 'false') return { t: 'bool', v: false };
        if (lower === 'null') return { t: 'null' };
        if (peek()?.kind === 'lparen') {
          next(); // consume (
          const args: ExprNode[] = [];
          if (peek()?.kind !== 'rparen') {
            args.push(parseOr());
            while (peek()?.kind === 'comma') {
              next();
              args.push(parseOr());
            }
          }
          const closing = next();
          if (closing.kind !== 'rparen') throw new ExpressionError('Expected ")"');
          if (!SCALAR_FNS.has(lower) && !AGGREGATE_FNS.has(lower)) {
            throw new ExpressionError(`Unknown function: ${token.text}`);
          }
          return { t: 'call', fn: lower, args };
        }
        return { t: 'col', name: token.text };
      }
      default:
        throw new ExpressionError(`Unexpected token "${token.text}"`);
    }
  }

  const root = parseOr();
  if (pos !== tokens.length) {
    throw new ExpressionError(`Unexpected trailing input "${tokens[pos].text}"`);
  }
  return root;
}

/** True when the node tree contains an aggregate function call. */
export function containsAggregate(node: ExprNode): boolean {
  switch (node.t) {
    case 'call':
      return AGGREGATE_FNS.has(node.fn) || node.args.some(containsAggregate);
    case 'bin':
      return containsAggregate(node.left) || containsAggregate(node.right);
    case 'un':
      return containsAggregate(node.operand);
    default:
      return false;
  }
}
