import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', { exclude: ['docs', 'docs-json'] });
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://optus.bamp.lat',
      'http://192.168.0.16:3001',
      'http://192.168.0.16:3000',
      'https://api.rnd.honeyguide.optus.lat',
      'https://rnd.optus.lat',
      'https://api.honeyguide.optus.lat',
      'https://www.optus.lat',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('optus API')
    .setDescription(
      'API para autenticación, pagos y webhooks. Usa Bearer token para rutas protegidas.',
    )
    .setVersion('1.0')
    .addServer('http://localhost:3001', 'local')
    .addServer('http://localhost:3000', 'Local')
    .addServer('https://api.rnd.honeyguide.optus.lat', 'Development')
    .addServer('https://rnd.optus.lat', 'Development')
    .addServer('https://api.honeyguide.optus.lat', 'Production')
    .addServer('https://www.optus.lat', 'Production')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Token emitido por /auth/login',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'optus API Docs',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
