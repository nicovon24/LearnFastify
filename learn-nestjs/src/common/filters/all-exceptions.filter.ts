/**
 * ALL EXCEPTIONS FILTER
 *
 * ¿Qué es un Exception Filter?
 * Captura excepciones que no fueron manejadas dentro del handler o service
 * y formatea la respuesta de error de forma consistente para toda la app.
 *
 * @Catch() sin argumentos → captura CUALQUIER excepción (no solo HttpException).
 * Si quisieras capturar solo errores HTTP, usarías @Catch(HttpException).
 *
 * ¿Por qué usarlo?
 * Sin esto, si en un service tirás `throw new Error('algo explotó')`,
 * Nest devuelve un 500 genérico. Con este filter devolvés siempre
 * el mismo formato JSON con timestamp, path, status y mensaje.
 *
 * Se registra globalmente en main.ts con useGlobalFilters().
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    // Con Fastify, el reply no es res de Node sino un FastifyReply.
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Si es una HttpException de Nest, extraemos su status y mensaje.
    // Si es cualquier otro Error (ej: fallo de DB), usamos 500.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };

    this.logger.error(
      `${request.method} ${request.url} → ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    // Con Fastify se usa reply.code().send() en lugar de res.status().json()
    reply.code(status).send(errorResponse);
  }
}
