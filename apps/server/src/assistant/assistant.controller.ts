import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { mercekAnalizInput } from '../capabilities/tool-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AssistantService, type AssistantResult } from './assistant.service';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
  now: z.string().datetime().optional(),
  context: z
    .object({
      path: z.string().max(200).optional(),
      planId: z.string().max(80).optional(), // aktif Sync Matrix planı (bağlam)
    })
    .optional(),
});
type ChatBody = z.infer<typeof chatSchema>;

@ApiTags('assistant')
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  @ApiOperation({ summary: 'Asistan kullanılabilir mi (API anahtarı var mı)' })
  status(): { available: boolean } {
    return { available: this.assistant.available() };
  }

  @Get('manifest')
  @ApiOperation({ summary: 'Asistanın bildiği yetenekler (üretilen katalog)' })
  manifest() {
    return this.assistant.manifest();
  }

  @Post('chat')
  @ApiOperation({ summary: 'Doğal dil sorusu → araçlı sorgu → Türkçe cevap' })
  chat(
    @Body(new ZodValidationPipe(chatSchema)) body: ChatBody,
  ): Promise<AssistantResult> {
    return this.assistant.chat(
      body.messages,
      body.now ?? new Date().toISOString(),
      body.context ?? {},
    );
  }

  @Post('mercege-ac')
  @ApiOperation({
    summary:
      'Sohbetteki bir paneli kalıcı Mercek analizine çevir (aracın kullandığı yol ile birebir aynı)',
  })
  async mercegeAc(
    @Body(new ZodValidationPipe(mercekAnalizInput as unknown as z.ZodType))
    body: z.infer<typeof mercekAnalizInput>,
  ): Promise<{ analysisId: string; url: string }> {
    const created = await this.assistant.createMercekAnalysis(body);
    return { analysisId: created.id, url: `/mercek/${created.id}` };
  }
}
