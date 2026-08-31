import { edgesSchema } from './ontology.controller';

/** /graph/edges boş-pk dayanıklılığı — kullanıcı bildirimi (kısmi seçim). */
describe('edgesSchema — boş pk sağlamlığı', () => {
  it('boş pk\'li node TÜM isteği düşürmez; geçerliler kalır', () => {
    const r = edgesSchema.safeParse({
      nodes: [
        { objectType: 'birlik', pk: 'BRL-003' },
        { objectType: 'platform', pk: 'PLT-0019' },
        { objectType: 'personel', pk: '' }, // ← eskiden tüm isteği patlatırdı
        { objectType: 'personel', pk: 'PER-00032' },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.nodes.map((n) => n.pk)).toEqual(['BRL-003', 'PLT-0019', 'PER-00032']);
  });

  it('boş objectType de atılır', () => {
    const r = edgesSchema.safeParse({ nodes: [{ objectType: '', pk: 'X' }, { objectType: 'birlik', pk: 'Y' }] });
    expect(r.success && r.data.nodes).toEqual([{ objectType: 'birlik', pk: 'Y' }]);
  });

  it('hepsi boşsa boş listeye düşer (400 değil)', () => {
    const r = edgesSchema.safeParse({ nodes: [{ objectType: 'x', pk: '' }] });
    expect(r.success && r.data.nodes).toEqual([]);
  });
});
