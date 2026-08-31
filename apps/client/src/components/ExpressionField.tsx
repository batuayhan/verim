import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import { parametreTokenSx } from '../theme/tokens';
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useRef, useState } from 'react';
import { AGGREGATE_DOCS, SCALAR_DOCS } from '../core/expression/catalog';
import { validateExpression } from '../core/expression/validate';
import type { ColumnSchema, TableSchema } from '../types/schema';

interface Suggestion {
  label: string;
  detail: string;
  /** Alana eklenecek metin (fonksiyonlarda parantez açık gelir) */
  insert: string;
}

/**
 * Autocomplete'li, canlı doğrulamalı expression alanı.
 * - Yazarken kolon / fonksiyon / $parametre önerileri (tıkla veya Tab)
 * - Şemaya karşı anlık doğrulama; hata Türkçe ve alanın altında
 * - Kolon çipleri: tıkla → imlece eklenir
 */
export function ExpressionField({
  value,
  onChange,
  schema,
  parameterNames,
  allowAggregates,
  placeholder,
  onValidChange,
}: {
  value: string;
  onChange: (value: string) => void;
  schema: TableSchema;
  parameterNames: string[];
  allowAggregates: boolean;
  placeholder?: string;
  onValidChange?: (valid: boolean) => void;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const error = useMemo(() => {
    const result = validateExpression(value, {
      schema,
      parameterNames,
      allowAggregates,
    });
    onValidChange?.(result === null && value.trim().length > 0);
    return result;
  }, [value, schema, parameterNames, allowAggregates, onValidChange]);

  // İmlecin üzerinde olduğu token
  const currentToken = useMemo(() => {
    const before = value.slice(0, caret);
    const match = /(\$?[A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
    return match ? match[1] : '';
  }, [value, caret]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!focused || currentToken.length < 1) return [];
    const q = currentToken.toLowerCase();

    if (q.startsWith('$')) {
      return parameterNames
        .filter((p) => `$${p}`.toLowerCase().startsWith(q))
        .map((p) => ({ label: `$${p}`, detail: 'parametre', insert: `$${p}` }));
    }

    const cols: Suggestion[] = schema.columns
      .filter((c) => c.name.toLowerCase().startsWith(q))
      .map((c) => ({ label: c.name, detail: c.type, insert: c.name }));

    const fns: Suggestion[] = [...SCALAR_DOCS, ...(allowAggregates ? AGGREGATE_DOCS : [])]
      .filter((f) => f.name.startsWith(q))
      .map((f) => ({
        label: f.signature,
        detail: f.description,
        insert: f.name === 'count' ? 'count()' : `${f.name}(`,
      }));

    return [...cols, ...fns].slice(0, 8).filter((s) => s.insert !== currentToken);
  }, [focused, currentToken, schema, parameterNames, allowAggregates]);

  const applySuggestion = (s: Suggestion) => {
    const before = value.slice(0, caret - currentToken.length);
    const after = value.slice(caret);
    const next = before + s.insert + after;
    onChange(next);
    const newCaret = before.length + s.insert.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCaret, newCaret);
      setCaret(newCaret);
    });
  };

  const insertAtCaret = (text: string) => {
    const next = value.slice(0, caret) + text + value.slice(caret);
    onChange(next);
    const newCaret = caret + text.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCaret, newCaret);
      setCaret(newCaret);
    });
  };

  const syncCaret = () => {
    setCaret(inputRef.current?.selectionStart ?? value.length);
  };

  return (
    <Box>
      <Box ref={anchorRef}>
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={2}
          placeholder={placeholder}
          value={value}
          inputRef={inputRef}
          onChange={(e) => {
            onChange(e.target.value);
            requestAnimationFrame(syncCaret);
          }}
          onSelect={syncCaret}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && suggestions.length > 0) {
              e.preventDefault();
              applySuggestion(suggestions[0]);
            }
          }}
          error={Boolean(error)}
          helperText={
            error ??
            (value.trim() ? (
              <Stack component="span" direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <CheckCircleOutlineIcon sx={{ fontSize: 14, color: 'success.main' }} />
                <span>Geçerli expression</span>
              </Stack>
            ) : ' ')
          }
          sx={{
            '& textarea': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13,
            },
          }}
        />
      </Box>

      <Popper
        open={suggestions.length > 0}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        sx={{ zIndex: 1400 }}
      >
        <Paper elevation={4} sx={{ width: 340, maxHeight: 240, overflowY: 'auto' }}>
          <List dense disablePadding>
            {suggestions.map((s, i) => (
              <ListItemButton
                key={s.label}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s);
                }}
                sx={i === 0 ? { bgcolor: 'action.hover' } : undefined}
              >
                <ListItemText
                  primary={
                    <Typography component="span" sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>
                      {s.label}
                    </Typography>
                  }
                  secondary={s.detail}
                />
                {i === 0 && (
                  <Typography variant="caption" color="text.secondary">
                    Tab ↹
                  </Typography>
                )}
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>

      {/* Kolon çipleri + fonksiyon yardımı */}
      <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Kolonlar:
        </Typography>
        {schema.columns.slice(0, 12).map((c) => (
          <ColumnChip key={c.name} column={c} onInsert={insertAtCaret} />
        ))}
        {parameterNames.map((p) => (
          <Chip
            key={p}
            size="small"
            label={`$${p}`}
            onClick={() => insertAtCaret(`$${p}`)}
            sx={[parametreTokenSx, { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }]}
          />
        ))}
        <Tooltip title="Fonksiyon listesi">
          <IconButton size="small" onClick={() => setHelpOpen((v) => !v)}>
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={helpOpen}>
        <Paper variant="outlined" sx={{ p: 1, mt: 0.5 }}>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {[...SCALAR_DOCS, ...(allowAggregates ? AGGREGATE_DOCS : [])].map((f) => (
              <Tooltip key={f.name} title={f.description}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={f.signature}
                  onClick={() => insertAtCaret(f.name === 'count' ? 'count()' : `${f.name}(`)}
                  sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
                />
              </Tooltip>
            ))}
          </Stack>
        </Paper>
      </Collapse>
    </Box>
  );
}

function ColumnChip({
  column,
  onInsert,
}: {
  column: ColumnSchema;
  onInsert: (text: string) => void;
}) {
  return (
    <Tooltip title={column.type}>
      <Chip
        size="small"
        variant="outlined"
        color="info"
        label={column.name}
        onClick={() => onInsert(column.name)}
        sx={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
      />
    </Tooltip>
  );
}
