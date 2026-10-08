import { AuthService, authOptionsFromEnv } from './auth.ts';
import { createStoreFromEnv } from './store-factory.ts';

const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const nickname = process.env.BOOTSTRAP_ADMIN_NICKNAME?.trim() || 'CET6 管理员';
const initialPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!username || !email || !initialPassword) {
  throw new Error('请配置 BOOTSTRAP_ADMIN_USERNAME、BOOTSTRAP_ADMIN_EMAIL 和 BOOTSTRAP_ADMIN_PASSWORD。');
}

const runtime = await createStoreFromEnv();
try {
  const auth = new AuthService(runtime.store, authOptionsFromEnv());
  const result = await auth.createManagedUser({ username, email, nickname, role: 'admin', initialPassword });
  console.log(`管理员已创建：${result.user.username} <${result.user.email}>；首次登录必须修改密码。`);
} finally {
  await runtime.store.close?.();
}
