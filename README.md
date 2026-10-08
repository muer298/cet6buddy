# CET6 Buddy V1 试用版

CET6 Buddy 是一个移动优先的六级学习 Web App。当前仓库包含 React + TypeScript PWA、Node.js API、MySQL 前向迁移、原创试用内容、管理后台和腾讯云香港部署配置。

## 本地启动

```bash
npm install
cp .env.example .env
# 填写 .env；本地可使用 STORAGE_DRIVER=memory，持久化使用 mysql
npm run db:check
npm run db:migrate
npm run content:seed
npm run dev:api
npm run dev
```

打开 `http://127.0.0.1:4173`。账号由管理员创建，初始密码首次登录后必须修改。`.env` 已被 Git 忽略，不得提交任何密码或腾讯云密钥。

## 已实现的业务闭环

- 用户名或邮箱加密码登录、scrypt 密码哈希、失败限流、首次强制改密、管理员建号与重置、HttpOnly Cookie、learner/editor/admin 后端权限校验。
- 服务端今日计划、次日生效、北京时间任务、1/3/7/14/30 日复习、收藏、首次答案、独立订正、跨设备会话恢复和每日 45 分账本上限。
- 单词学习、听力音频与位置恢复、阅读切换、翻译/作文开放输出和本地离线草稿。
- 词根串串、单词闪答、例句连胜的服务端计分；小队邀请、周榜和一次计榜的异步挑战。
- 私有附件上传：本地开发保存或 COS 最小权限 STS 直传，真实 MIME、大小、摘要与所有者校验。
- 内容/导入后台：字段校验、审核状态、不可变新版本、发布、下架和审计事件。
- PWA Manifest、安装图标、Service Worker、应用外壳缓存和可控更新提示。登录、挑战、榜单和上传始终要求联网。

## 内容与迁移

`server/migrations/mysql/0001_initial.sql` 及后续迁移只向前执行，已经执行的历史文件不得修改。`content/pilot` 包含 204 个词汇条目、3 组原创听力、3 篇原创阅读、20 条翻译题和 20 个作文句式；`npm run content:seed` 可幂等导入 250 条内容记录。用户资料的结构化模板位于 `content/templates`。

## 验证

```bash
npm run typecheck
npm run test:server
npm run build
node scripts/visual-check.mjs
npm audit --omit=dev
```

浏览器脚本覆盖真实登录、19 个路由、360–430px 移动布局、私有上传和单词练习。正式邀请测试仍需在 iPhone Safari、安卓 Chrome、微信内浏览器以及目标跨境网络上人工验收。

## 腾讯云部署

部署文件位于 `deploy/`：Nginx 同域反向代理、systemd 服务、不可变 release、上一版本回滚和 MySQL 逻辑备份。正式环境使用香港轻量应用服务器、香港云 MySQL和 COS 私有桶，并配置域名与 HTTPS。详细步骤见 [deploy/README.md](deploy/README.md)。

上线前还必须完成 COS 跨域规则、数据库自动备份和至少一次隔离恢复演练；这些需要真实云账号，仓库不会包含密钥。

## V1 边界

V1 不包含实时答题房间、OCR、AI 作文反馈、自动音频对齐、模拟考试和小岛装饰。开放表达只保存与自检，不做机械自动评分；未经许可的真题不得发布到公开题库。
