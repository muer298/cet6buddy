# 真实记录与移动端 UI 修正（2026-10-10）

## 本次范围

- 首页按登录账号的 username 问候；仅展示服务器任务进度和积分账本的当日实际积分。
- 删除首页“小队在学”、演示统计、固定昵称、虚构复习趋势及没有功能的头部操作按钮。
- 学习中心展示当前账号可见、校验通过的已发布内容数量；未发布内容显示“暂无内容”。
- 待复习按到期的“内容 + 技能”计数；收藏按收藏记录计数；待订正按普通学习会话的首次错答且尚未订正的记录计数。游戏和挑战不纳入该错题列表。
- 已练词汇对普通识义练习和独立拼写中出现的词汇去重，不代表已掌握，不包含游戏。
- 列表分页，订正由服务器校验冻结版本答案，不覆盖首次作答；不通过挑战记录提前泄露答案。
- 翻译与作文读取已发布题干、来源和参考表达；输入草稿按账号、内容及版本隔离。
- 未入队显示“小队”及创建/加入；已入队显示“周榜”，同分采用竞争排名（1、1、3），所有成员展示真实积分，邀请信息收起到次级区域。
- 导航、模块、任务和开始按钮采用统一 SVG，游戏卡片全宽，任务文案左对齐。
- 不删除真实账号、学习历史或已发布内容；无数据库迁移，无新增数据库权限。

## 接口

- `GET /api/me/learning-summary`：本账号统计及可用题库数量。
- `GET /api/me/learning-items?filter=reviews|collections|mistakes&page=1`：个人记录分页。
- `GET /api/learning/output?kind=translation|writing&content=<可选 ID>`：已发布开放表达内容。
- `GET /api/me/plan` 新增 `earned_points`，以北京时间日界计算账本积分。
- `POST /api/attempts/:id/corrections` 仅允许订正本账号普通学习错答，必须与冻结答案一致。

## 验证

- `npm run typecheck`
- `npm run test:server`：26 项测试，包含零记录、双账号隔离、分页、订正、挑战隐藏、不可用收藏、发布可见性和账本来源。
- 运行本地 Vite 于 4186 后执行 `node scripts/check-dashboard-ui.ts`：真实 API 处理器与隔离内存数据库，不使用生产账号；检查双账号、创建/加入、同分周榜、断网错误状态及 8 个页面在 360/390/430px 下的布局。
- `npm run build`
- `node scripts/check-statusbar-ui.mjs`：19 个页面 × 3 个宽度的补充回归；强制文档导航并检查登录状态，避免只切换 hash 而误测登录页。
- `node --env-file=<服务端配置路径> scripts/verify-dashboard-db.ts`：云 MySQL 只读检查，不创建测试行。

桌面 Chromium 的移动视口检查不能代替 iPhone Safari、安卓与微信真机测试。用户看到旧界面时，应响应 PWA 新版本提示或关闭页面后重新打开。

## 发布记录

- 线上发布目录：`/opt/cet6-buddy/releases/20261010-dashboard-0132`。
- 上一版保留：`/opt/cet6-buddy/releases/20261009-internal-users`。
- 前端入口：`index-CF4p_lQN.js`，样式：`index-DSO-70Kh.css`。
- 云 MySQL 两个内部账号的只读查询验证通过；服务健康检查通过；未执行迁移或修改生产账号数据。
- 本地源码与 Git 仓库：`/Users/kugua/Desktop/CET6 Buddy`。
