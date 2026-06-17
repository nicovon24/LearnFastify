/**
 * PUNTO DE ENTRADA DE LA APLICACIÓN
 *
 * Acá se "bootstrappea" Nest: se elige el adapter HTTP (Fastify),
 * se configuran pipes globales, Swagger, y se levanta el servidor.
 *
 * Conceptos que vas a ver acá:
 *  - NestFastifyApplication: le dice a Nest que use Fastify en vez de Express.
 *  - ValidationPipe global: intercepta TODOS los requests antes de que lleguen
 *    a cualquier controller y valida los DTOs automáticamente.
 *  - SwaggerModule: genera la UI de documentación en /api/docs a partir
 *    de los decoradores que vas a ver en controllers y DTOs.
 */

import { NestFactory } from '@nestjs/core';
import {
  NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  /**
   * NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
   *
   * El tipo genérico <NestFastifyApplication> le da a `app` los métodos
   * específicos de Fastify (como listen con host). El segundo argumento
   * es el adapter: si lo cambiás por `new ExpressAdapter()` (o lo sacás),
   * toda tu lógica de negocio sigue funcionando igual — el adapter es
   * transparente para controllers, services y guards.
   */
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  /**
   * PIPES GLOBALES
   *
   * ValidationPipe valida automáticamente los bodies de los requests
   * contra los DTOs que definas con class-validator.
   *
   * - whitelist: true → elimina campos que no están en el DTO (seguridad).
   * - forbidNonWhitelisted: true → devuelve 400 si llegan campos extra.
   * - transform: true → convierte strings a los tipos definidos en el DTO
   *   (ej: "42" → number si el DTO dice @IsNumber()).
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * INTERCEPTORS GLOBALES
   *
   * Un interceptor envuelve la ejecución del handler. LoggingInterceptor
   * mide el tiempo de respuesta de cada request. Se aplica a TODA la app.
   * Ver: src/common/interceptors/logging.interceptor.ts
   */
  app.useGlobalInterceptors(new LoggingInterceptor());

  /**
   * EXCEPTION FILTERS GLOBALES
   *
   * Captura cualquier excepción no manejada y devuelve una respuesta
   * JSON consistente con timestamp, path y mensaje de error.
   * Ver: src/common/filters/all-exceptions.filter.ts
   */
  app.useGlobalFilters(new AllExceptionsFilter());

  /**
   * SWAGGER / OPENAPI
   *
   * DocumentBuilder construye la metadata del documento OpenAPI.
   * SwaggerModule.setup() sirve la UI en la ruta /api/docs.
   * Los DTOs y controllers se documentan solos con sus decoradores.
   */
  const config = new DocumentBuilder()
    .setTitle('Player Stats API')
    .setDescription(
      'API de estadísticas de jugadores de fútbol. Construida con NestJS + Fastify.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT', // nombre del esquema — los controllers lo referencian con @ApiBearerAuth('JWT')
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  /**
   * listen('3000', '0.0.0.0') — Fastify requiere el host explícito para
   * escuchar en todas las interfaces (importante si corrés en Docker).
   */
  await app.listen(3000, '0.0.0.0');
  console.log(`🚀 Application running on: http://localhost:3000`);
  console.log(`📚 Swagger docs at: http://localhost:3000/api/docs`);
}

bootstrap();
