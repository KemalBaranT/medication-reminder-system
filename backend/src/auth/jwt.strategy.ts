import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  role: string;
  email: string;
}

/**
 * Korumali her istekte Bearer token'ini dogrular ve cozumlenen veriyi,
 * asagi akista `@CurrentUser()` ile `RolesGuard`in kullandigi `AuthUser`
 * nesnesine donusturur. JwtAuthGuard ile korunan her rotada calistigindan,
 * performans icin kasitli olarak durumsuzdur (veritabani sorgusu yapmaz);
 * bunun bedeli, devre disi birakilmis bir hesabin aninda iptal edilmek
 * yerine token'i suresi dolana kadar gecerli kalmasidir.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-to-a-long-random-string',
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub, role: payload.role, email: payload.email };
  }
}
