import { Alert, Autocomplete, Box, Stack, TextField, Typography } from '@mui/material';
import { updateMercekCard } from '../../store/mercekSlice';
import { useAppDispatch } from '../../store/hooks';
import type {
  ObjectSetDef,
  OntologyResponse,
  MercekCard,
} from '../../types/mercek';
import { ObjectSetTableBody } from './ObjectSetTableBody';

/**
 * "İlişkiden kolon ekle" kartı — satır seviyesinde join. Nesne kümesi aynı
 * kalır; seçilen ilişkinin hedef tipinden kolonlar tabloya eklenir
 * (Mercek'daki "Join to linked objects"). Kolonlar çoklu seçimle belirlenir.
 */
export function JoinLinkedCardBody({
  card,
  selfDef,
  ontology,
}: {
  card: Extract<MercekCard, { kind: 'joinLinked' }>;
  selfDef: ObjectSetDef | null;
  ontology: OntologyResponse;
}) {
  const dispatch = useAppDispatch();

  const link = ontology.linkTypes.find((l) => l.apiName === card.linkType);
  const target = ontology.objectTypes.find(
    (t) => t.apiName === link?.toObjectType,
  );

  if (!link || !target) {
    return <Alert severity="warning">İlişki tanımı bulunamadı: {card.linkType}</Alert>;
  }

  const options = target.properties.map((p) => p.apiName);
  const labelOf = (apiName: string) =>
    target.properties.find((p) => p.apiName === apiName)?.displayName ?? apiName;

  return (
    <Stack spacing={1} sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          {target.icon ?? ''} {target.displayName} tipinden eklenecek kolonlar:
        </Typography>
        <Autocomplete
          multiple
          size="small"
          disableCloseOnSelect
          sx={{ minWidth: 260, flexGrow: 1 }}
          options={options}
          getOptionLabel={labelOf}
          value={card.columns}
          onChange={(_, columns) => {
            if (columns.length === 0) return; // en az bir kolon kalmalı
            dispatch(updateMercekCard({ ...card, columns }));
          }}
          renderInput={(params) => (
            <TextField {...params} placeholder={card.columns.length ? '' : 'Kolon seç'} />
          )}
        />
      </Stack>
      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ObjectSetTableBody def={selfDef} />
      </Box>
    </Stack>
  );
}
