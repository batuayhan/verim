import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Module,
  Post,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

/**
 * Basit dummy kimlik doğrulama: tek kullanıcı (hvlamd/hvlamd), statik
 * bearer token. Gerçek bir IdP değildir — demo dağıtımını sokağa açık
 * bırakmamak içindir. Login hariç tüm endpoint'ler token ister;
 * test ortamında (NODE_ENV=test) guard devre dışıdır.
 */

const VALID_USERNAME = 'hvlamd';
const VALID_PASSWORD = 'hvlamd';

/** Deterministik ama tahmin edilmesi anlamsız statik token. */
export const AUTH_TOKEN = createHash('sha256')
  .update(`atlas:${VALID_USERNAME}:${VALID_PASSWORD}:v1`)
  .digest('hex');

const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

// --- roller (Sprint 4: yönetişim) -------------------------------------------

export type Rol = 'kullanici' | 'admin' | 'onaylayan';
const ROL_META = 'gerekliRoller';
/** Bir endpoint'in istediği rollerden EN AZ BİRİ yeterli. */
export const Roller = (...roller: Rol[]) => SetMetadata(ROL_META, roller);

export interface Kullanici {
  ad: string;
  roller: Set<Rol>;
}

/**
 * Token → kullanıcı(ad+roller) haritası. Varsayılan statik token TÜM rolleri
 * taşır (geriye uyumluluk: tek-token kurulumu her şeyi yapabilir; ama dört-göz
 * onayı ancak İKİNCİ bir token'la — farklı 'ad' — mümkün olur).
 * Ek token'lar: AUTH_TOKENS = "token:ad:rol1|rol2, token2:ad2:onaylayan"
 */
export function tokenHaritasi(): Map<string, Kullanici> {
  const m = new Map<string, Kullanici>();
  m.set(AUTH_TOKEN, { ad: 'hvlamd', roller: new Set<Rol>(['kullanici', 'admin', 'onaylayan']) });
  for (const giris of (process.env.AUTH_TOKENS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [token, ad, roller] = giris.split(':');
    if (!token || !ad) continue;
    m.set(token, {
      ad,
      roller: new Set((roller ?? 'kullanici').split('|') as Rol[]),
    });
  }
  return m;
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Giriş — hvlamd/hvlamd, bearer token döner' })
  login(
    @Body(new ZodValidationPipe(loginSchema))
    body: { username: string; password: string },
  ): { token: string } {
    if (body.username !== VALID_USERNAME || body.password !== VALID_PASSWORD) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Kullanıcı adı veya şifre hatalı',
      });
    }
    return { token: AUTH_TOKEN };
  }
}

/** Token isteyen API önekleri — bunların dışı (statik frontend) serbest. */
const GUARDED_PREFIXES = [
  '/datasets',
  '/query',
  '/analyses',
  '/mercek',
  '/objectsets',
  '/graph',
  '/ontology',
  '/assistant',
  '/alerts',
  '/dashboards',
];

@Injectable()
export class TokenGuard implements CanActivate {
  private readonly tokenlar = tokenHaritasi();
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const gerekliRoller = this.reflector.getAllAndOverride<Rol[]>(ROL_META, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      path?: string;
      url: string;
      kullanici?: Kullanici;
    }>();

    // Test ortamında guard yok — ama rol isteyen uçlar için sahte admin
    // kimliği koy ki controller mantığı (audit/dört-göz) çalışabilsin.
    if (process.env.NODE_ENV === 'test') {
      req.kullanici = { ad: 'test', roller: new Set<Rol>(['kullanici', 'admin', 'onaylayan']) };
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const path = req.path ?? req.url;
    const korunmali = GUARDED_PREFIXES.some((p) => path.startsWith(p));
    if (!korunmali && !gerekliRoller) return true;

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const kullanici = this.tokenlar.get(token);
    if (!kullanici) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Oturum gerekli — /auth/login' });
    }
    req.kullanici = kullanici;

    // Rol isteyen uçta: kullanıcının rollerinden en az biri eşleşmeli
    if (gerekliRoller && !gerekliRoller.some((r) => kullanici.roller.has(r))) {
      throw new UnauthorizedException({
        code: 'YETKI_YOK',
        message: `Bu işlem şu rollerden birini ister: ${gerekliRoller.join(', ')}`,
      });
    }
    return true;
  }
}

@Module({
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: TokenGuard }],
})
export class AuthModule {}
