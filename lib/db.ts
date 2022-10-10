import Keyv from '@keyvhq/core';
import KeyvRedis from '@keyvhq/redis';

import { isRedisEnabled, redisUrl, redisNamespace } from './config';

let db: Keyv;
if (isRedisEnabled) {
  console.log('\n\nREDIS URL:', redisUrl, '\n');
  const keyvRedis = new KeyvRedis(redisUrl);
  db = new Keyv({ store: keyvRedis, namespace: redisNamespace || undefined });
} else {
  db = new Keyv();
}

export { db };
