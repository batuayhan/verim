import { Body, Controller, Get, Header, Inject, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type {
  ObjectSetAggregateRequest,
  ObjectSetAggregateResponse,
  ObjectSetDef,
  ObjectSetLoadRequest,
  ObjectSetLoadResponse,
  ObjectSetTimeseriesRequest,
  ObjectSetTimeseriesResponse,
  OntologyResponse,
} from '../contract/mercek';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  GRAPH_PROVIDER,
  type GraphEdge,
  type GraphNeighbors,
  type GraphProvider,
} from './graph-provider';
import {
  OBJECT_SET_ENGINE,
  type IObjectSetEngine,
} from './object-set-engine';
import { ONTOLOGY_PROVIDER, type OntologyProvider } from './ontology-provider';
import { ontologyToTurtle } from './owl-export';
import { mimKaynakMap } from '../mim/mim-ontology';
import { AdmissionService } from './admission/admission.service';
import type { AdmissionRapor } from './admission/types';

// --- zod şemaları (recursive def için z.lazy) --------------------------------

const filterValueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('literal'),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.object({ kind: z.literal('parameter'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('relative'),
    unit: z.enum(['minute', 'hour', 'day']),
    amount: z.number().int().positive(),
  }),
]);

const conditionSchema = z.object({
  id: z.string(),
  column: z.string().min(1),
  operator: z.enum([
    'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'in',
    'contains', 'startsWith', 'endsWith', 'matchesRegex', 'isNull', 'isNotNull',
  ]),
  values: z.array(filterValueSchema),
  caseSensitive: z.boolean().optional(),
});

export const objectSetDefSchema: z.ZodType<ObjectSetDef> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('base'), objectType: z.string().min(1) }),
    z.object({
      type: z.literal('filter'),
      base: objectSetDefSchema,
      combinator: z.enum(['and', 'or']),
      conditions: z.array(conditionSchema),
    }),
    z.object({
      type: z.literal('searchAround'),
      base: objectSetDefSchema,
      linkType: z.string().min(1),
    }),
    z.object({
      type: z.literal('joinLinked'),
      base: objectSetDefSchema,
      linkType: z.string().min(1),
      columns: z.array(z.string().min(1)).min(1).max(20),
    }),
    z.object({
      type: z.literal('fromPrimaryKeys'),
      objectType: z.string().min(1),
      keys: z.array(z.union([z.string(), z.number()])).max(10_000),
    }),
  ]),
) as z.ZodType<ObjectSetDef>;

const parametersSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const metricSchema = z.object({
  fn: z.enum(['count', 'sum', 'avg', 'min', 'max', 'countDistinct']),
  property: z.string().optional(),
});

/** API'nin gerçek istek şekli — asistan araç şemaları da BUNDAN türetilir
    (paralel elle-yazım yok; API'ye eklenen alan araca otomatik akar) */
export const loadRequestSchema = z.object({
  def: objectSetDefSchema,
  parameters: parametersSchema,
  limit: z.number().int().positive().max(5000).optional(),
});
const loadSchema = loadRequestSchema as z.ZodType<ObjectSetLoadRequest>;

export const aggregateRequestSchema = z.object({
  def: objectSetDefSchema,
  parameters: parametersSchema,
  groupBy: z.string().optional(),
  segmentBy: z.string().optional(),
  metric: metricSchema,
  limit: z.number().int().positive().max(500).optional(),
});
const aggregateSchema = aggregateRequestSchema as z.ZodType<ObjectSetAggregateRequest>;

export const timeseriesRequestSchema = z.object({
  def: objectSetDefSchema,
  parameters: parametersSchema,
  dateProperty: z.string().min(1),
  metric: metricSchema,
  granularity: z.enum(['hour', 'day', 'week', 'month']),
});
const timeseriesSchema = timeseriesRequestSchema as z.ZodType<ObjectSetTimeseriesRequest>;

// --- bağlantı analizi (graph/neighbors) --------------------------------------

const neighborsSchema = z.object({
  objectType: z.string().min(1),
  pk: z.string().min(1),
  limit: z.number().int().min(1).max(30).optional(),
});
type NeighborsRequest = z.infer<typeof neighborsSchema>;

export const edgesSchema = z.object({
  // Boş/geçersiz pk'li node'lar TÜM isteği düşürmesin — sessizce atılır, kalan
  // node'lar arasındaki kenarlar yine döner (kısmi seçimlerde sağlam davranış).
  nodes: z.preprocess(
    (v) =>
      Array.isArray(v)
        ? v.filter((n) => {
            const o = n as { pk?: unknown; objectType?: unknown };
            return (
              typeof o?.pk === 'string' &&
              o.pk.trim() !== '' &&
              typeof o?.objectType === 'string' &&
              o.objectType !== ''
            );
          })
        : v,
    z.array(z.object({ objectType: z.string().min(1), pk: z.string().min(1) })).max(80),
  ),
});
type EdgesRequest = z.infer<typeof edgesSchema>;

interface NeighborsResponse {
  focus: {
    objectType: string;
    pk: string;
    label: string;
    icon?: string;
    displayName: string;
  } | null;
  groups: Array<{
    linkType: string;
    linkLabel: string;
    toObjectType: string;
    toDisplayName: string;
    icon?: string;
    total: number;
    nodes: Array<{ pk: string; label: string }>;
  }>;
}

// --- controller ----------------------------------------------------------------

@ApiTags('ontology')
@Controller()
export class OntologyController {
  constructor(
    @Inject(ONTOLOGY_PROVIDER) private readonly ontology: OntologyProvider,
    @Inject(OBJECT_SET_ENGINE) private readonly engine: IObjectSetEngine,
    @Inject(GRAPH_PROVIDER) private readonly graph: GraphProvider,
    private readonly admission: AdmissionService,
  ) {}

  @Post('ontology/extensions/validate')
  @ApiOperation({ summary: 'Aday ontoloji uzantısını KURU-KOŞU doğrula (kademe 1-3)' })
  validateExtension(@Body() body: unknown): Promise<AdmissionRapor> {
    // Doğrulama salt-okunur; aktif ontolojiyi etkilemez. Şema hataları
    // rapordaki kademe-1 bulgularına düşer (400 fırlatmaz — rapor döner).
    return this.admission.dogrula(body);
  }

  @Get('ontology')
  @ApiOperation({ summary: 'Nesne tipleri ve ilişkiler (Mercek temelidir)' })
  getOntology(): Promise<OntologyResponse> {
    return this.ontology.getOntology();
  }

  @Get('ontology.ttl')
  @ApiOperation({ summary: 'Ontolojinin OWL/Turtle dışa aktarımı (ADR K3)' })
  @Header('Content-Type', 'text/turtle; charset=utf-8')
  async getOntologyTurtle(@Query('base') base?: string): Promise<string> {
    const ontology = await this.ontology.getOntology();
    return ontologyToTurtle(ontology, {
      baseUri: base || process.env.ONTOLOGY_BASE_URI || undefined,
      mimKaynak: mimKaynakMap(),
    });
  }

  @Post('objectsets/load')
  @ApiOperation({ summary: 'Object set tanımını çözüp nesneleri döner' })
  load(
    @Body(new ZodValidationPipe(loadSchema)) body: ObjectSetLoadRequest,
  ): Promise<ObjectSetLoadResponse> {
    return this.engine.load(body);
  }

  @Post('objectsets/aggregate')
  @ApiOperation({ summary: 'Object set üzerinde grupla + metrik hesapla' })
  aggregate(
    @Body(new ZodValidationPipe(aggregateSchema)) body: ObjectSetAggregateRequest,
  ): Promise<ObjectSetAggregateResponse> {
    return this.engine.aggregate(body);
  }

  @Post('objectsets/timeseries')
  @ApiOperation({ summary: 'Object set üzerinden zaman serisi türet' })
  timeseries(
    @Body(new ZodValidationPipe(timeseriesSchema)) body: ObjectSetTimeseriesRequest,
  ): Promise<ObjectSetTimeseriesResponse> {
    return this.engine.timeseries(body);
  }

  @Post('graph/neighbors')
  @ApiOperation({
    summary:
      'Bağlantı analizi: bir nesnenin TÜM giden ilişkileri boyunca komşu nesneleri döner ' +
      '(GRAPH_PROVIDER — mim modunda gerçek graf DB Neo4j)',
  })
  neighbors(
    @Body(new ZodValidationPipe(neighborsSchema)) body: NeighborsRequest,
  ): Promise<GraphNeighbors> {
    return this.graph.neighbors(body.objectType, body.pk, body.limit ?? 12);
  }

  @Post('graph/edges')
  @ApiOperation({
    summary:
      'Verilen düğüm KÜMESİ içindeki TÜM kenarları döner — canvas\'taki düğümler ' +
      'otomatik bağlanır (graf DB indeks-araması)',
  })
  async edges(
    @Body(new ZodValidationPipe(edgesSchema)) body: EdgesRequest,
  ): Promise<{ edges: GraphEdge[] }> {
    return { edges: await this.graph.edgesAmong(body.nodes) };
  }
}
