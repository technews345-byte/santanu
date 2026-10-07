// Minimal safe arithmetic evaluator supporting + - * / % and decimals, no eval().

// Percent follows phone-calculator convention: in "A+B%" / "A-B%" the B% is
// B percent *of A*; everywhere else it is plain B/100.
function resolvePercents(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    if (token !== '%') {
      out.push(token);
      continue;
    }
    const operand = out.pop();
    if (operand === undefined) continue;
    const operator = out[out.length - 1];
    const base = out[out.length - 2];
    if ((operator === '+' || operator === '-') && base !== undefined) {
      out.push(String((parseFloat(base) * parseFloat(operand)) / 100));
    } else {
      out.push(String(parseFloat(operand) / 100));
    }
  }
  return out;
}

export function evaluateExpression(expression: string): number {
  const sanitized = expression.replace(/[^0-9+\-*/.%]/g, '');
  if (!sanitized) return 0;

  const rawTokens = sanitized.match(/(\d+\.?\d*|\.\d+|[+\-*/%])/g);
  if (!rawTokens || rawTokens.length === 0) return 0;

  // A leading minus can result from pressing '=' after a subtraction.
  if (rawTokens[0] === '-') rawTokens.unshift('0');
  const tokens = resolvePercents(rawTokens);
  // Ignore a trailing operator while the next operand is being entered, but
  // never silently accept malformed decimals or missing operands.
  if (isOperator(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.some((token, index) => index % 2 === 0
    ? !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/.test(token) || !Number.isFinite(Number(token))
    : !isOperator(token))) return NaN;
  if (tokens.length === 0) return 0;

  // Pass 1: handle * and /
  const stage1: (number | string)[] = [];
  const num = (t: string) => parseFloat(t);
  stage1.push(num(tokens[0]));
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i];
    const next = tokens[i + 1];
    if (next === undefined) break;
    if (op === '*' || op === '/') {
      const prev = stage1.pop() as number;
      const nextVal = num(next);
      stage1.push(op === '*' ? prev * nextVal : nextVal !== 0 ? prev / nextVal : NaN);
    } else {
      stage1.push(op, num(next));
    }
    i += 2;
  }

  // Pass 2: handle + and -
  let result = typeof stage1[0] === 'number' ? (stage1[0] as number) : 0;
  for (let j = 1; j < stage1.length; j += 2) {
    const op = stage1[j];
    const val = stage1[j + 1] as number;
    if (op === '+') result += val;
    else if (op === '-') result -= val;
  }

  return Math.round(result * 100) / 100;
}

export function isOperator(key: string): boolean {
  return key === '+' || key === '-' || key === '*' || key === '/';
}

export function formatExpressionDisplay(expression: string): string {
  return expression
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/\+/g, ' + ')
    .replace(/-/g, ' − ');
}
