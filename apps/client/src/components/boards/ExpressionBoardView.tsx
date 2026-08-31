import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { SCALAR_DOCS, AGGREGATE_DOCS } from '../../core/expression/catalog';
import { validateExpression } from '../../core/expression/validate';
import { updateBoard } from '../../store/analysisSlice';
import { selectAnalysis, useAppDispatch, useAppSelector } from '../../store/hooks';
import type { ExpressionBoardConfig } from '../../types/boards';
import type { ColumnType, TableSchema } from '../../types/schema';
import { isNumeric } from '../../types/schema';
import { ExpressionField } from '../ExpressionField';
import type { BoardViewProps } from '../BoardCard';

type Mode = ExpressionBoardConfig['mode'];

const MODE_LABELS: Record<Mode, string> = {
  addColumn: 'Yeni kolon',
  replaceColumn: 'Kolon değiştir',
  filter: 'Filtrele',
  aggregate: 'Aggregate',
};

const TYPES: ColumnType[] = ['string', 'integer', 'double', 'boolean', 'date', 'timestamp'];
const ARITH_OPS = ['+', '-', '*', '/'] as const;

function emptyFor(mode: Mode, id: string): ExpressionBoardConfig {
  switch (mode) {
    case 'addColumn':
      return { type: 'expression', id, mode, columnName: '', expression: '', resultType: 'double' };
    case 'replaceColumn':
      return { type: 'expression', id, mode, column: '', expression: '', resultType: 'double' };
    case 'filter':
      return { type: 'expression', id, mode, expression: '' };
    case 'aggregate':
      return {
        type: 'expression', id, mode,
        groupBys: [{ alias: '', expression: '', resultType: 'string' }],
        aggregates: [{ alias: '', expression: '', resultType: 'double' }],
      };
  }
}

export function ExpressionBoardView({
  ctx,
  board,
  inputSchema,
}: BoardViewProps & { board: ExpressionBoardConfig }) {
  const dispatch = useAppDispatch();
  const analysis = useAppSelector(selectAnalysis);
  const [draft, setDraft] = useState<ExpressionBoardConfig>(board);
  const parameterNames = (analysis?.parameters ?? []).map((p) => p.name);

  const setMode = (mode: Mode | null) => {
    if (mode && mode !== draft.mode) setDraft(emptyFor(mode, board.id));
  };

  const vctx = (allowAggregates: boolean) => ({
    schema: inputSchema,
    parameterNames,
    allowAggregates,
  });

  // Apply edilebilir mi? — tüm expression'lar geçerli ve zorunlu alanlar dolu
  const applyDisabled = (() => {
    switch (draft.mode) {
      case 'addColumn':
        return (
          !draft.columnName.trim() ||
          !draft.expression.trim() ||
          validateExpression(draft.expression, vctx(false)) !== null
        );
      case 'replaceColumn':
        return (
          !draft.column ||
          !draft.expression.trim() ||
          validateExpression(draft.expression, vctx(false)) !== null
        );
      case 'filter':
        return (
          !draft.expression.trim() ||
          validateExpression(draft.expression, vctx(false)) !== null
        );
      case 'aggregate':
        return (
          draft.aggregates.length === 0 ||
          draft.aggregates.some(
            (a) =>
              !a.alias.trim() ||
              !a.expression.trim() ||
              validateExpression(a.expression, vctx(true)) !== null,
          ) ||
          draft.groupBys.some(
            (g) =>
              (g.alias.trim() || g.expression.trim()) &&
              (!g.alias.trim() ||
                !g.expression.trim() ||
                validateExpression(g.expression, vctx(false)) !== null),
          )
        );
    }
  })();

  const apply = () => {
    const cleaned =
      draft.mode === 'aggregate'
        ? { ...draft, groupBys: draft.groupBys.filter((g) => g.expression.trim()) }
        : draft;
    dispatch(updateBoard({ pathId: ctx.path.id, board: cleaned }));
  };

  return (
    <Stack spacing={2}>
      <ToggleButtonGroup exclusive size="small" value={draft.mode} onChange={(_, v: Mode | null) => setMode(v)}>
        {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
          <ToggleButton key={m} value={m} sx={{ textTransform: 'none' }}>
            {MODE_LABELS[m]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {draft.mode === 'addColumn' && (
        <AddColumnEditor
          draft={draft}
          setDraft={setDraft}
          schema={inputSchema}
          parameterNames={parameterNames}
        />
      )}

      {draft.mode === 'replaceColumn' && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1}>
            <Select
              size="small"
              displayEmpty
              value={draft.column}
              sx={{ minWidth: 180 }}
              onChange={(e) => setDraft({ ...draft, column: e.target.value })}
            >
              <MenuItem value="" disabled>Değişecek kolon</MenuItem>
              {inputSchema.columns.map((c) => (
                <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
              ))}
            </Select>
            <Select
              size="small"
              value={draft.resultType}
              onChange={(e) => setDraft({ ...draft, resultType: e.target.value as ColumnType })}
            >
              {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </Stack>
          <ExpressionField
            value={draft.expression}
            onChange={(expression) => setDraft({ ...draft, expression })}
            schema={inputSchema}
            parameterNames={parameterNames}
            allowAggregates={false}
            placeholder="örn: upper(region)"
          />
        </Stack>
      )}

      {draft.mode === 'filter' && (
        <Stack spacing={1}>
          <Alert severity="info" sx={{ py: 0 }}>
            Basit koşullar için <b>Filter</b> board'u daha kolaydır — burası
            karmaşık mantık içindir (örn. <code>revenue / quantity &gt; 500 and region != 'İstanbul'</code>).
          </Alert>
          <ExpressionField
            value={draft.expression}
            onChange={(expression) => setDraft({ ...draft, expression })}
            schema={inputSchema}
            parameterNames={parameterNames}
            allowAggregates={false}
            placeholder="Doğru/yanlış üreten bir ifade yaz"
          />
        </Stack>
      )}

      {draft.mode === 'aggregate' && (
        <AggregateEditor
          draft={draft}
          setDraft={setDraft}
          schema={inputSchema}
          parameterNames={parameterNames}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button size="small" onClick={() => setDraft(board)}>Vazgeç</Button>
        <Button size="small" variant="contained" onClick={apply} disabled={applyDisabled}>
          Uygula
        </Button>
      </Stack>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Yeni kolon — Kolay mod (select'lerle) + Expression modu
// ---------------------------------------------------------------------------

function AddColumnEditor({
  draft,
  setDraft,
  schema,
  parameterNames,
}: {
  draft: Extract<ExpressionBoardConfig, { mode: 'addColumn' }>;
  setDraft: (d: ExpressionBoardConfig) => void;
  schema: TableSchema;
  parameterNames: string[];
}) {
  const [ui, setUi] = useState<'easy' | 'code'>('easy');
  const [template, setTemplate] = useState<'arith' | 'func'>('arith');
  const [left, setLeft] = useState('');
  const [op, setOp] = useState<(typeof ARITH_OPS)[number]>('*');
  const [rightKind, setRightKind] = useState<'column' | 'constant'>('column');
  const [rightCol, setRightCol] = useState('');
  const [rightConst, setRightConst] = useState('');
  const [fn, setFn] = useState('round');
  const [fnCol, setFnCol] = useState('');

  const numericCols = schema.columns.filter(isNumeric);
  const templateFns = SCALAR_DOCS.filter((f) => f.simpleTemplate);

  const buildEasy = (over: Partial<Record<string, string>> = {}) => {
    const t = (over.template ?? template) as 'arith' | 'func';
    if (t === 'arith') {
      const l = over.left ?? left;
      const o = over.op ?? op;
      const rk = over.rightKind ?? rightKind;
      const r = rk === 'column' ? (over.rightCol ?? rightCol) : (over.rightConst ?? rightConst);
      if (!l || !r) return '';
      return `${l} ${o} ${r}`;
    }
    const f = over.fn ?? fn;
    const c = over.fnCol ?? fnCol;
    if (!c) return '';
    return `${f}(${c})`;
  };

  const syncEasy = (over: Partial<Record<string, string>> = {}) => {
    const expression = buildEasy(over);
    const t = (over.template ?? template) as 'arith' | 'func';
    const resultType: ColumnType =
      t === 'arith'
        ? 'double'
        : (templateFns.find((x) => x.name === (over.fn ?? fn))?.resultType ?? 'double');
    setDraft({ ...draft, expression, resultType });
  };

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <TextField
          size="small"
          label="Yeni kolonun adı"
          value={draft.columnName}
          onChange={(e) => setDraft({ ...draft, columnName: e.target.value })}
        />
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={ui}
          onChange={(_, v: 'easy' | 'code' | null) => v && setUi(v)}
        >
          <ToggleButton value="easy" sx={{ textTransform: 'none' }}>Kolay</ToggleButton>
          <ToggleButton value="code" sx={{ textTransform: 'none' }}>
            <Tooltip title="Expression yaz"><CodeIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {ui === 'easy' ? (
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={template}
            onChange={(_, v: 'arith' | 'func' | null) => {
              if (!v) return;
              setTemplate(v);
              syncEasy({ template: v });
            }}
          >
            <ToggleButton value="arith" sx={{ textTransform: 'none' }}>İki değerle hesapla</ToggleButton>
            <ToggleButton value="func" sx={{ textTransform: 'none' }}>Kolona fonksiyon uygula</ToggleButton>
          </ToggleButtonGroup>

          {template === 'arith' ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Select
                size="small" displayEmpty value={left} sx={{ minWidth: 150 }}
                onChange={(e) => { setLeft(e.target.value); syncEasy({ left: e.target.value }); }}
              >
                <MenuItem value="" disabled>Kolon</MenuItem>
                {numericCols.map((c) => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
              </Select>
              <Select
                size="small" value={op} sx={{ minWidth: 70 }}
                onChange={(e) => { const v = e.target.value as typeof op; setOp(v); syncEasy({ op: v }); }}
              >
                {ARITH_OPS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </Select>
              <Select
                size="small" value={rightKind} sx={{ minWidth: 100 }}
                onChange={(e) => { const v = e.target.value as 'column' | 'constant'; setRightKind(v); syncEasy({ rightKind: v }); }}
              >
                <MenuItem value="column">Kolon</MenuItem>
                <MenuItem value="constant">Sabit sayı</MenuItem>
              </Select>
              {rightKind === 'column' ? (
                <Select
                  size="small" displayEmpty value={rightCol} sx={{ minWidth: 150 }}
                  onChange={(e) => { setRightCol(e.target.value); syncEasy({ rightCol: e.target.value }); }}
                >
                  <MenuItem value="" disabled>Kolon</MenuItem>
                  {numericCols.map((c) => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
                </Select>
              ) : (
                <TextField
                  size="small" type="number" placeholder="örn: 1.2" value={rightConst} sx={{ width: 120 }}
                  onChange={(e) => { setRightConst(e.target.value); syncEasy({ rightConst: e.target.value }); }}
                />
              )}
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Select
                size="small" value={fn} sx={{ minWidth: 200 }}
                onChange={(e) => { setFn(e.target.value); syncEasy({ fn: e.target.value }); }}
              >
                {templateFns.map((f) => (
                  <MenuItem key={f.name} value={f.name}>
                    {f.signature} — {f.description}
                  </MenuItem>
                ))}
              </Select>
              <Select
                size="small" displayEmpty value={fnCol} sx={{ minWidth: 150 }}
                onChange={(e) => { setFnCol(e.target.value); syncEasy({ fnCol: e.target.value }); }}
              >
                <MenuItem value="" disabled>Kolon</MenuItem>
                {schema.columns.map((c) => <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>)}
              </Select>
            </Stack>
          )}

          {draft.expression && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">Üretilen:</Typography>
              <Chip
                size="small"
                label={draft.expression}
                sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
              />
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack spacing={1}>
          <ExpressionField
            value={draft.expression}
            onChange={(expression) => setDraft({ ...draft, expression })}
            schema={schema}
            parameterNames={parameterNames}
            allowAggregates={false}
            placeholder="örn: round(revenue / quantity, 2)"
          />
          <Select
            size="small"
            value={draft.resultType}
            sx={{ width: 160 }}
            onChange={(e) => setDraft({ ...draft, resultType: e.target.value as ColumnType })}
          >
            {TYPES.map((t) => <MenuItem key={t} value={t}>Sonuç tipi: {t}</MenuItem>)}
          </Select>
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Aggregate — satır bazında Kolay (fn + kolon select) / Expression
// ---------------------------------------------------------------------------

function AggregateEditor({
  draft,
  setDraft,
  schema,
  parameterNames,
}: {
  draft: Extract<ExpressionBoardConfig, { mode: 'aggregate' }>;
  setDraft: (d: ExpressionBoardConfig) => void;
  schema: TableSchema;
  parameterNames: string[];
}) {
  const [codeRows, setCodeRows] = useState<Set<string>>(new Set());

  const toggleCode = (key: string) => {
    const next = new Set(codeRows);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCodeRows(next);
  };

  const setGroup = (i: number, patch: Partial<{ alias: string; expression: string; resultType: ColumnType }>) =>
    setDraft({
      ...draft,
      groupBys: draft.groupBys.map((g, j) => (j === i ? { ...g, ...patch } : g)),
    });

  const setAgg = (i: number, patch: Partial<{ alias: string; expression: string; resultType: ColumnType }>) =>
    setDraft({
      ...draft,
      aggregates: draft.aggregates.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    });

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="text.secondary">Neye göre grupla</Typography>
        {draft.groupBys.map((g, i) => {
          const key = `g${i}`;
          const isCode = codeRows.has(key);
          return (
            <Stack key={key} direction="row" spacing={1} sx={{ mb: 1, alignItems: 'flex-start' }}>
              {isCode ? (
                <>
                  <TextField
                    size="small" label="Kolon adı" value={g.alias} sx={{ width: 160 }}
                    onChange={(e) => setGroup(i, { alias: e.target.value })}
                  />
                  <Box sx={{ flexGrow: 1 }}>
                    <ExpressionField
                      value={g.expression}
                      onChange={(expression) => setGroup(i, { expression })}
                      schema={schema}
                      parameterNames={parameterNames}
                      allowAggregates={false}
                      placeholder='örn: year(created_at)'
                    />
                  </Box>
                </>
              ) : (
                <Select
                  size="small" displayEmpty value={g.expression} sx={{ minWidth: 220 }}
                  onChange={(e) => {
                    const col = e.target.value;
                    const colType = schema.columns.find((c) => c.name === col)?.type ?? 'string';
                    setGroup(i, { expression: col, alias: col, resultType: colType });
                  }}
                >
                  <MenuItem value="" disabled>Kolon seç</MenuItem>
                  {schema.columns.map((c) => (
                    <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                  ))}
                </Select>
              )}
              <Tooltip title={isCode ? 'Kolay moda dön' : 'Expression yaz (örn. year(created_at))'}>
                <IconButton size="small" color={isCode ? 'primary' : 'default'} onClick={() => toggleCode(key)}>
                  <CodeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                onClick={() => setDraft({ ...draft, groupBys: draft.groupBys.filter((_, j) => j !== i) })}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
        <Button
          size="small" startIcon={<AddIcon />}
          onClick={() =>
            setDraft({ ...draft, groupBys: [...draft.groupBys, { alias: '', expression: '', resultType: 'string' }] })
          }
        >
          Gruplama ekle
        </Button>
      </Box>

      <Box>
        <Typography variant="overline" color="text.secondary">Hesaplanacak değerler</Typography>
        {draft.aggregates.map((a, i) => {
          const key = `a${i}`;
          const isCode = codeRows.has(key);
          // Kolay mod: expression "fn(col)" veya "count()" kalıbındaysa parse edilir
          const match = /^([a-z_]+)\((.*)\)$/.exec(a.expression.trim());
          const easyFn = match?.[1] ?? 'sum';
          const easyCol = match?.[2] ?? '';
          return (
            <Stack key={key} direction="row" spacing={1} sx={{ mb: 1, alignItems: 'flex-start' }}>
              {isCode ? (
                <>
                  <TextField
                    size="small" label="Kolon adı" value={a.alias} sx={{ width: 160 }}
                    onChange={(e) => setAgg(i, { alias: e.target.value })}
                  />
                  <Box sx={{ flexGrow: 1 }}>
                    <ExpressionField
                      value={a.expression}
                      onChange={(expression) => setAgg(i, { expression })}
                      schema={schema}
                      parameterNames={parameterNames}
                      allowAggregates
                      placeholder='örn: round(sum(revenue) / count(), 2)'
                    />
                  </Box>
                </>
              ) : (
                <>
                  <Select
                    size="small" value={AGGREGATE_DOCS.some((f) => f.name === easyFn) ? easyFn : 'sum'}
                    sx={{ minWidth: 170 }}
                    onChange={(e) => {
                      const f = e.target.value;
                      const expr = f === 'count' ? 'count()' : easyCol ? `${f}(${easyCol})` : '';
                      const doc = AGGREGATE_DOCS.find((x) => x.name === f);
                      setAgg(i, {
                        expression: expr,
                        alias: f === 'count' ? 'satir_sayisi' : easyCol ? `${f}_${easyCol}` : '',
                        resultType: doc?.resultType ?? 'double',
                      });
                    }}
                  >
                    {AGGREGATE_DOCS.map((f) => (
                      <MenuItem key={f.name} value={f.name}>{f.description} — {f.name}</MenuItem>
                    ))}
                  </Select>
                  {easyFn !== 'count' && (
                    <Select
                      size="small" displayEmpty value={easyCol} sx={{ minWidth: 170 }}
                      onChange={(e) => {
                        const col = e.target.value;
                        setAgg(i, { expression: `${easyFn}(${col})`, alias: `${easyFn}_${col}` });
                      }}
                    >
                      <MenuItem value="" disabled>Kolon seç</MenuItem>
                      {schema.columns
                        .filter((c) => (['sum', 'avg', 'median', 'stddev', 'variance'].includes(easyFn) ? isNumeric(c) : true))
                        .map((c) => (
                          <MenuItem key={c.name} value={c.name}>{c.name}</MenuItem>
                        ))}
                    </Select>
                  )}
                </>
              )}
              <Tooltip title={isCode ? 'Kolay moda dön' : 'Expression yaz (örn. sum(a)/count())'}>
                <IconButton size="small" color={isCode ? 'primary' : 'default'} onClick={() => toggleCode(key)}>
                  <CodeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <IconButton
                size="small"
                disabled={draft.aggregates.length === 1}
                onClick={() => setDraft({ ...draft, aggregates: draft.aggregates.filter((_, j) => j !== i) })}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
        <Button
          size="small" startIcon={<AddIcon />}
          onClick={() =>
            setDraft({ ...draft, aggregates: [...draft.aggregates, { alias: '', expression: '', resultType: 'double' }] })
          }
        >
          Değer ekle
        </Button>
      </Box>

      <Alert severity="info" sx={{ py: 0 }}>
        Sonuç tablosu yalnızca gruplama kolonları + hesaplanan değerlerden oluşur;
        sonraki board'lar bu yeni tabloyu görür.
      </Alert>
    </Stack>
  );
}
