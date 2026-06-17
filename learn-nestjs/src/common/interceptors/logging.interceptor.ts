/**
 * LOGGING INTERCEPTOR
 *
 * ¿Qué es un Interceptor?
 * Un interceptor implementa NestInterceptor y tiene acceso al contexto
 * de ejecución ANTES y DESPUÉS de que el handler (método del controller)
 * corra. Esto lo logra con RxJS: intercept() retorna un Observable que
 * envuelve la llamada a next.handle() (que es el handler en sí).
 *
 * ¿Por qué usarlo para logging?
 * Porque necesitás medir el tiempo entre "entró el request" y
 * "se envió la respuesta", y eso implica lógica en ambos momentos.
 * Hacerlo en cada controller sería repetitivo — acá lo definís una vez
 * y lo aplicás globalmente en main.ts con useGlobalInterceptors().
 *
 * Alternativas de uso: transformar la respuesta, cachear, rate-limit, etc.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const start = Date.now();

    // next.handle() dispara la ejecución del handler real.
    // tap() corre lógica DESPUÉS de que el handler resuelva, sin modificar el resultado.
    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - start;
        this.logger.log(`${method} ${url} — ${elapsed}ms`);
      }),
    );
  }
}
