import { Logger } from '@nestjs/common';
import { createApplication } from './application.js';
import { readEnvironment } from './config/environment.js';

try {
  const config = readEnvironment(process.env);
  const app = await createApplication(config);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  try {
    // Local foundation only. External binding/deployment belongs to BE-006.
    await app.listen(config.API_PORT, '127.0.0.1');
  } catch {
    await app.close();
    throw new Error('API listen failed');
  }
} catch {
  new Logger('Bootstrap').error('API startup failed: check environment and local port availability.');
  process.exitCode = 1;
}
