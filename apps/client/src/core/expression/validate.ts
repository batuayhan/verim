/**
 * Client-side expression doğrulama — kullanıcı yazarken, servise
 * gitmeden: sözdizimi, bilinmeyen kolon, tanımsız parametre ve yanlış
 * bağlamda aggregate kullanımı yakalanır.
 */

import type { TableSchema } from '../../types/schema';
import {
  AGGREGATE_FNS,
  containsAggregate,
  ExpressionError,
  parseExpression,
  type ExprNode,
} from './parser';

export interface ValidationContext {
  schema: TableSchema;
  parameterNames: string[];
  /** aggregate modundaki expression'lar için true */
  allowAggregates: boolean;
}

/** Geçerliyse null, değilse kullanıcıya gösterilecek Türkçe hata döner. */
export function validateExpression(
  src: string,
  ctx: ValidationContext,
): string | null {
  if (!src.trim()) return null; // boş alanın uyarısı ayrı ele alınır

  let root: ExprNode;
  try {
    root = parseExpression(src);
  } catch (e) {
    if (e instanceof ExpressionError) return translateParseError(e.message);
    return String(e);
  }

  const columnNames = new Set(ctx.schema.columns.map((c) => c.name));
  const paramNames = new Set(ctx.parameterNames);
  const issues: string[] = [];

  const walk = (node: ExprNode): void => {
    switch (node.t) {
      case 'col':
        if (!columnNames.has(node.name)) {
          const suggestion = closestMatch(node.name, [...columnNames]);
          issues.push(
            `Bilinmeyen kolon: "${node.name}"${suggestion ? ` — "${suggestion}" mi demek istedin?` : ''}`,
          );
        }
        break;
      case 'param':
        if (!paramNames.has(node.name)) {
          issues.push(
            `Tanımsız parametre: $${node.name} — önce sol panelden oluştur`,
          );
        }
        break;
      case 'call':
        if (AGGREGATE_FNS.has(node.fn) && !ctx.allowAggregates) {
          issues.push(
            `${node.fn}() bir aggregate fonksiyonudur — yalnızca Aggregate modunda kullanılabilir`,
          );
        }
        node.args.forEach(walk);
        break;
      case 'bin':
        walk(node.left);
        walk(node.right);
        break;
      case 'un':
        walk(node.operand);
        break;
      default:
        break;
    }
  };
  walk(root);

  if (ctx.allowAggregates && !containsAggregate(root)) {
    issues.push(
      'Aggregate modunda en az bir aggregate fonksiyonu gerekir (örn. sum, count)',
    );
  }

  return issues.length > 0 ? issues[0] : null;
}

function translateParseError(message: string): string {
  if (message.startsWith('Unknown function')) {
    const name = message.split(': ')[1] ?? '';
    return `Bilinmeyen fonksiyon: ${name} — Yardım bölümünden geçerli fonksiyonları gör`;
  }
  if (message.includes('Unterminated string')) return "Kapanmamış metin — tek tırnak (') eksik";
  if (message.includes('Unterminated quoted')) return 'Kapanmamış kolon adı — çift tırnak (") eksik';
  if (message.includes('Unexpected end')) return 'Expression yarım kalmış görünüyor';
  if (message.includes('Expected ")"')) return 'Kapanmayan parantez';
  if (message.startsWith('Unexpected character')) return `Geçersiz karakter: ${message.split('"')[1] ?? ''}`;
  if (message.startsWith('Unexpected trailing')) return `Sonda beklenmeyen ifade: ${message.split('"')[1] ?? ''}`;
  return message;
}

/** Basit yazım-yakınlığı önerisi (kısa Levenshtein). */
function closestMatch(input: string, candidates: string[]): string | null {
  const lower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = 3; // en fazla 2 harf farkı öner
  for (const c of candidates) {
    const d = levenshtein(lower, c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}
