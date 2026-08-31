import { Alert, LinearProgress, Typography } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useMemo, useRef } from 'react';
import { useNesneDetay } from '../../nesne/NesneDetay';
import { resultTypeOf } from '../../nesne/resultType';
import { useObjectSet, useOntology } from '../api';
import { useMercekParams } from '../params';
import type { ObjectSetDef, PropertyDef } from '../../types/mercek';

/**
 * Set üreten her kartın gövdesi: nesne tablosu + sayı rozeti.
 * Satıra tıklamak nesnenin ONTOLOJİK DETAYINI açar (özellikler +
 * ilişkiler; oradan sonsuz drill) — tablo bir çıkmaz sokak değildir.
 */
export function ObjectSetTableBody({
  def,
  primaryKeyHint,
}: {
  def: ObjectSetDef | null;
  primaryKeyHint?: string;
}) {
  const { values: params } = useMercekParams();
  const { data, isFetching, error } = useObjectSet(def, params, 100);
  const { data: ontology } = useOntology();
  const detay = useNesneDetay();

  const sonucTipi = useMemo(() => resultTypeOf(def, ontology), [def, ontology]);
  const pkKolonu = ontology?.objectTypes.find((t) => t.apiName === sonucTipi)?.primaryKey;

  // Kolon KİMLİĞİ şema değişmedikçe SABİT kalır: canlı modda her tazeleme
  // yeni bir properties dizisi döner, ama kolon adları/tipleri aynıysa
  // columns referansı değişmez → DataGrid kullanıcının ayarladığı kolon
  // genişliklerini KORUR (yalnız satır verisi güncellenir). Şema anahtarı
  // değişince (farklı sorgu) columns yeniden kurulur.
  const propsRef = useRef<PropertyDef[]>([]);
  if (data?.properties) propsRef.current = data.properties;
  const semaAnahtari = (data?.properties ?? [])
    .map((p) => `${p.apiName}:${p.type}`)
    .join('|');
  const columns = useMemo<GridColDef[]>(
    () =>
      propsRef.current.map((p) => ({
        field: p.apiName,
        headerName: p.displayName,
        flex: 1,
        minWidth: 110,
        type: p.type === 'integer' || p.type === 'double' ? ('number' as const) : undefined,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semaAnahtari],
  );
  const rows = useMemo(
    () => (data?.objects ?? []).map((o, i) => ({ __id: i, ...o })),
    [data?.objects],
  );

  if (error) return <Alert severity="error">{String(error)}</Alert>;
  if (!def) return <Alert severity="warning">Girdi kartı silinmiş — zincir kırık.</Alert>;

  return (
    <>
      {isFetching && <LinearProgress />}
      {data && (
        <Typography variant="caption" color="text.secondary">
          {data.totalCount.toLocaleString('tr-TR')} nesne
          {data.truncated && ` · ilk ${data.objects.length} gösteriliyor`}
          {primaryKeyHint && ` · anahtar: ${primaryKeyHint}`}
          {sonucTipi && pkKolonu && ' · satıra tıkla → detay'}
        </Typography>
      )}
      <DataGrid
        density="compact"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.__id as number}
        disableColumnMenu
        hideFooter
        onRowClick={
          sonucTipi && pkKolonu
            ? (p) => {
                const pk = (p.row as Record<string, unknown>)[pkKolonu];
                if (pk != null) detay.ac(sonucTipi, String(pk));
              }
            : undefined
        }
        sx={{
          bgcolor: 'background.paper',
          mt: 0.5,
          flexGrow: 1,
          minHeight: 0,
          ...(sonucTipi && pkKolonu ? { '& .MuiDataGrid-row': { cursor: 'pointer' } } : {}),
        }}
      />
    </>
  );
}
