import { createRequire } from 'node:module';

export interface EmailSender {
  sendLoginCode(email: string, code: string): Promise<void>;
}

export class MemoryEmailSender implements EmailSender {
  readonly codes = new Map<string, string>();

  async sendLoginCode(email: string, code: string): Promise<void> {
    this.codes.set(email, code);
  }
}

export class DevelopmentEmailSender implements EmailSender {
  async sendLoginCode(email: string): Promise<void> {
    const masked = email.replace(/^(.).+(@.+)$/, '$1***$2');
    console.log(`Development login code generated for ${masked}. Use AUTH_EXPOSE_CODE=true to receive it in the local API response.`);
  }
}

interface TencentSesClient {
  SendEmail(input: Record<string, unknown>): Promise<unknown>;
}

export class TencentSesEmailSender implements EmailSender {
  private readonly client: TencentSesClient;
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
    const required = ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY', 'SES_FROM_EMAIL', 'SES_TEMPLATE_ID'] as const;
    for (const key of required) if (!env[key]) throw new Error(`生产邮件配置缺少 ${key}`);
    const require = createRequire(import.meta.url);
    const sdk = require('tencentcloud-sdk-nodejs-ses') as {
      ses: { v20201002: { Client: new (config: Record<string, unknown>) => TencentSesClient } };
    };
    this.client = new sdk.ses.v20201002.Client({
      credential: { secretId: env.TENCENT_SECRET_ID, secretKey: env.TENCENT_SECRET_KEY },
      region: env.SES_REGION ?? 'ap-hongkong',
      profile: { httpProfile: { endpoint: 'ses.tencentcloudapi.com' } },
    });
  }

  async sendLoginCode(email: string, code: string): Promise<void> {
    await this.client.SendEmail({
      FromEmailAddress: this.env.SES_FROM_EMAIL,
      Destination: [email],
      Subject: 'CET6 Buddy 登录验证码',
      Template: {
        TemplateID: Number(this.env.SES_TEMPLATE_ID),
        TemplateData: JSON.stringify({ code, minutes: 10 }),
      },
      Unsubscribe: '0',
    });
  }
}

export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if ((env.EMAIL_DRIVER ?? 'development') === 'tencent-ses') return new TencentSesEmailSender(env);
  return new DevelopmentEmailSender();
}
