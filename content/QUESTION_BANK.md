# 数据库题库接入

当前接通：单词选择与拼写、听力/阅读题组、单人游戏和异步挑战。翻译/作文页面的内容选择尚未接入此链路。

## 编辑流程

以 editor/admin 登录，打开 `#admin` 的「真实题库」区：选择类型与可见范围，粘贴 JSON，保存草稿，核对题干、选项、答案、解析、来源和授权，再点击发布。

`correct_index` 从 0 开始（A=0、B=1）。单词要求 word、meaning、prompt、options、correct_index、explanation、source；音标 phonetic 可选。阅读要求 title、passage、source、questions；听力要求 title、source、asset_id、questions。题组内每题同样要求 prompt、options、correct_index、explanation。支持每组 1–50 题。

听力先上传音频，再复制管理后台「资料导入」中显示的资源 ID，填入 asset_id。发布会验证音频存在、MIME 和使用权限。附件保持私有，只有获准查看题目的学习者才能取得短时签名音频地址；不会使整个 COS 桶公开。

上传 PDF/图片只是私有附件，不会自动切题。可把有权使用的材料、答案、解析和希望的可见范围交给维护者整理录入。当前内置题仍是试用示例，不能视为官方真题库。`content/pilot/words.csv` 不会自动发布。

## 数据和版本

- 唯一内容事实来源：MySQL 的 content_items 和 content_versions；新会话不从 server/data.ts 回退出题。
- 每个新会话持久化题目 ID 与内容版本。新草稿不遮盖当前发布版；再次发布会替换生效版本；下架取消所有发布版，旧会话仍按原版恢复和判分。
- 单词题 ID 是内容 ID；题组的题目 ID 是 `内容ID:组内序号`。复习状态引用父内容 ID，避免破坏既有外键。
- 私有题仅供所有者练习；小队挑战只使用公开题。暂未实现 team 可见内容的成员共享。
- 题库不足时返回明确错误，不把听读题补入单词游戏。
- 列表 `/api/question-bank?kind=word&page=1&page_size=20` 只返回可见发布内容的摘要。学习会话不提前返回答案和解析。

## 兼容升级与验证

`node --env-file=.env server/upgrade-question-bank.ts` 预览既有 12 道示例题的升级；加 `--apply` 才写入。升级只新增内容/版本，保留历史 payload 并写入发布审计，不导入 204 词草稿。生产运行应使用受保护的服务环境文件。

新增会话的 question_ids_json 采用 `{questionIds, questionVersions}` 对象，旧数组记录仍可读，不需要新增 DDL 权限或修改历史 SQL 迁移。注意：升级前的旧程序不认识新对象格式；代码回滚必须保留本次版本引用读取逻辑，不能直接切回旧程序。数据库备份应保留，不要用恢复旧库的方式丢弃上线后的作答。

本地：`npm run test:server`、`npm run build`。云端显式执行 `scripts/verify-question-bank.ts` 可检查 MySQL 持久化、私有隔离、版本冻结、发布/下架、判分和游戏题源；默认结束后停用测试账号，保留私有审计记录。

## 2026-10-09 验收记录

- 本地 23 项后端测试、TypeScript 检查及生产构建通过。
- 腾讯云 MySQL 8.0.30-txsql 实测通过：新题发布、私有隔离、草稿不遮盖发布版、旧会话版本引用持久化、判分、复习外键、下架、游戏版本、听读数据以及 Secure Cookie。
- 隔离浏览器实测：后台录入私有草稿、数据库单词/听读页面、阅读提交判分、360/390/430px 无横向溢出、无页面异常。截图位于 screenshots/question-bank/。
- 公开可用内容为原有 10 道单词示例、1 组听力和 1 篇阅读，均标注“非官方真题”。未发布 204 词试用草稿，也未接入外部商业/官方题库。
- 两个临时测试账号已停用并撤销会话，私有测试内容已下架，临时密码文件已删除；审计和测试作答记录保留。
- 发布目录 `/opt/cet6-buddy/releases/20261009-question-bank-final`。部署前备份 `/var/backups/cet6-buddy/cet6_buddy-before-question-bank-20261009.sql.gz` 已通过 gzip 完整性检查；本次未执行恢复演练。低权限 mysqldump 使用 `--single-transaction --set-gtid-purged=OFF --no-tablespaces`，未增加数据库权限。
