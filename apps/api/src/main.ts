import { Logger } from '@nestjs/common';
import { createApplication } from './application.js';
import { readEnvironment } from './config/environment.js';

try {
  const config = readEnvironment(process.env);
  const app = await createApplication(config);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  try {
    // Local runs stay loopback by default; container/network binding requires explicit API_HOST.
    await app.listen(config.API_PORT, config.API_HOST);
  } catch {
    await app.close();
    throw new Error('API listen failed');
  }
} catch {
  new Logger('Bootstrap').error('API startup failed: check environment and local port availability.');
  process.exitCode = 1;
}
