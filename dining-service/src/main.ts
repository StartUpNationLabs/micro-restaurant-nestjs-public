import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { SwaggerUIConfig } from './shared/config/interfaces/swaggerui-config.interface';

import { AppModule } from './app.module';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { Resource } from '@opentelemetry/resources';
// Don't forget to import the dotenv package!
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';

export const otelSDK = (serviceName: string, oltpUrl: string) => {
  const sdk = new NodeSDK({
    resource: new Resource({
      'service.name': serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      // optional - default url is http://localhost:4318/v1/traces
      url: oltpUrl,
      // optional - collection of custom headers to be sent with each request, empty by default
      headers: {},
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new RedisInstrumentation({

      }),
    ],
  });

  // // gracefully shut down the SDK on process exit
  // process.on('SIGTERM', () => {
  //   sdk
  //     .shutdown()
  //     .then(
  //       () => console.log('SDK shut down successfully'),
  //       (err) => console.log('Error shutting down SDK', err)
  //     )
  //     .finally(() => process.exit(0));
  // });
  return sdk;
};

async function bootstrap() {
  otelSDK('dining-service', process.env.OTLP_URL || 'http://localhost:4318/v1/traces').start();

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // Retrieve config service
  const configService = app.get(ConfigService);

  // Add validation pipi for all endpoints
  app.useGlobalPipes(new ValidationPipe());

  // Swagger UI Definition
  const swaggeruiConfig = configService.get<SwaggerUIConfig>('swaggerui');
  const config = new DocumentBuilder()
    .setTitle(swaggeruiConfig.title)
    .setDescription(swaggeruiConfig.description)
    .setVersion(configService.get('npm_package_version'))
    .addServer('/', 'Without gateway')
    .addServer('/dining', 'Through gateway')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(swaggeruiConfig.path, app, document);

  // Starts listening for shutdown hooks
  app.enableShutdownHooks();

  // Run the app
  const appPort = configService.get('app.port');
  await app.listen(appPort);
}
bootstrap();
