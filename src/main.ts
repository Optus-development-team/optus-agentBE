import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { WhatsAppWebhookModels } from './dto/whatsapp-webhook.dto';
import * as dotenv from 'dotenv';
import chokidar from 'chokidar';

// Configurar watcher para recargar .env en tiempo real
const envWatcher = chokidar.watch('.env', {
  ignoreInitial: true,
  persistent: true,
});

envWatcher.on('change', (path) => {
  const envLogger = new Logger('EnvWatcher');
  envLogger.log(`🔄 Archivo ${path} modificado, recargando variables...`);
  dotenv.config();
  envLogger.log('✅ Variables de entorno recargadas');
  envLogger.warn(
    '⚠️  Nota: Los servicios que cachean valores en constructores NO se actualizarán automáticamente',
  );
});

async function bootstrap() {
  // Cargar variables de entorno al inicio
  dotenv.config();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Habilitar CORS para permitir peticiones desde otros dominios
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    exposedHeaders: ['X-PAYMENT-RESPONSE'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BMS WhatsApp Webhook API')
    .setDescription(
      'Documentación interactiva del webhook de WhatsApp y endpoints auxiliares',
    )
    .setVersion('1.0.0')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: WhatsAppWebhookModels,
  });

  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Aplicación corriendo en: http://localhost:${port}`);
  logger.log(
    `Webhook de WhatsApp disponible en: http://localhost:${port}/webhook`,
  );
  logger.log(
    `Documentación Swagger disponible en: http://localhost:${port}/docs`,
  );
}
void bootstrap();
