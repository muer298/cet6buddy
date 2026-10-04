# CET6 Buddy UI Prototype

这是根据《六级学习伙伴 手机网页产品与开发说明 V1.0》构建的 React + TypeScript 前端工程。项目保留第一阶段 UI 视觉稿，并开始实现真实的学习业务闭环。

## 运行

安装依赖后，分别启动前端和 API：

```bash
npm install
npm run dev
npm run dev:api
```

打开 `http://localhost:4173`。建议用浏览器设备模式查看 390 × 844 的手机效果。

生产构建：

```bash
npm run typecheck
npm run build
```

构建结果输出到 `dist/`。

后端默认运行在 `http://127.0.0.1:8787`。开发模式下前端会自动连接该地址；部署时可通过 `VITE_API_BASE_URL` 调整。

## MySQL 持久化

默认仍使用零配置的内存存储。要连接电脑里的 MySQL：

```bash
cp .env.example .env
# 编辑 .env：将 STORAGE_DRIVER 改为 mysql，并填写 DATABASE_URL 或 DB_* 配置
mysql -u root -p -e "CREATE DATABASE cet6_buddy CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
npm run db:check
npm run db:migrate
npm run dev:api
```

`.env` 已被 Git 忽略，不要把密码提交到仓库。部署线上时继续使用同一套迁移，只需把 `DATABASE_URL` 换为云 MySQL 地址；若云数据库要求 TLS，再设置 `DB_SSL=true`。本机数据不会自动同步到线上，需要数据时应单独执行导出和导入。

## 已覆盖界面

- 今日：每日计划、同步提示、任务进度和小队进度
- 学习：单词、听力、阅读、翻译、作文句式
- 闯关：词根串串、单词闪答、例句连胜、结果与订正
- 小队：周榜、共同目标、异步同题挑战
- 我的：打卡日历、学习资产、资料上传、目标设置
- 账号：登录和首次计划设置
- 管理后台：内容库、状态、版本和发布流程示意

## 原型边界

- 当前包含 React + TypeScript 前端和 Node TypeScript API，使用原创演示内容。
- 单词模块已经接入真实 HTTP 接口，支持创建学习会话、冻结题目版本、逐题提交、首次答案锁定、幂等重试、订正反馈、结算与每日奖励防重复。
- `server/migrations/0001_initial.sql` 保留 SQLite/D1 结构；`server/migrations/mysql/` 是实际 MySQL 迁移。
- 后端支持内存或 MySQL 存储。内存模式重启会清空，MySQL 模式会持久保留学习会话、作答与积分。
- 尚未接入真实登录、音频、文件存储、云同步或 PWA。
- 游戏得分、学习积分和知识掌握数据在界面中保持为三种不同概念。
- `app.js` 是第一阶段静态原型快照；正式入口为 `src/main.tsx`。
- 下一阶段接入真实认证与用户权限，并继续保持幂等和内容版本约束。

## API 测试

```bash
npm run test:server
```

测试覆盖健康检查、北京时间计划、CORS、答案不提前泄露、首次答案锁定、幂等提交、题目版本冲突与奖励防重复。
