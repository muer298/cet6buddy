# CET6 Buddy API V1 开发说明

## 当前接口

### POST /api/auth/password/login

使用管理员创建的用户名或邮箱和密码登录。连续失败会按账号标识和来源 IP 限流。

```json
{
  "identifier": "xiaolin",
  "password": "用户密码"
}
```

### POST /api/auth/password/change

登录用户修改密码。管理员创建或重置后的账号在完成此接口前不能访问学习业务。

```json
{
  "current_password": "初始密码",
  "new_password": "至少10位且包含字母和数字"
}
```

### GET/POST /api/admin/users

仅管理员可查看和创建账号。创建成功时只返回一次 `temporary_password`。

### POST /api/admin/users/{id}/reset-password

仅管理员可重置密码；重置会撤销该账号全部现有会话，并要求下次登录修改密码。

### GET /health

返回 API 健康状态与服务器 UTC 时间。

### GET /api/me/plan

返回按 Asia/Shanghai 生成的服务器日期、计划档位和五类今日任务。`earned_points` 是当日积分账本合计，不根据任务标签估算。

复习目标为 `min(档位上限, 今日已完成复习 + 当前到期条目数)`，按内容与技能去重。没有到期复习时目标为 0，不阻碍打卡、不发放免费积分。

### GET /api/me/learning-summary

返回当前登录账号的 `practicedWords`、`todayPoints`、`reviews`、`collections`、`mistakes`、`planTier` 和五类已发布可用内容数量 `modules`。识义/拼写的已练词汇去重；错题仅统计普通学习首次错答中未订正的作答，不揭晓挑战。

### GET /api/me/learning-items

`filter=reviews|collections|mistakes`，支持 `page`、`page_size`。列表仅属于当前账号；不可用内容保留记录并返回 `available: false`。正确订正后从待订正列表移除，首次成绩不变。

### GET /api/learning/output

`kind=translation|writing`，可选 `content` 指定内容 ID。返回当前账号可访问且校验通过的已发布题干、来源和参考表达，支持分页。

### POST /api/study/sessions

创建个人练习会话并冻结题目列表与版本。返回给客户端的题目不包含正确答案和解析。

普通新词抽题排除已有练习记录的词汇；题库耗尽返回 `QUESTION_BANK_EMPTY`。指定内容重练仍可创建会话，但不会重复计入新词进度。

请求示例：

```json
{
  "source": "due_reviews",
  "mode": "practice"
}
```

### POST /api/sessions/{id}/answers

提交一道题的首次答案。`idempotency_key` 必填，同一幂等键重复发送会返回原结果；即使换用新幂等键，同一会话中同一道题也只保留首次答案。

```json
{
  "question_id": "w-sustainable",
  "question_version": 1,
  "answer": 1,
  "idempotency_key": "client-generated-key"
}
```

### POST /api/sessions/{id}/finish

必须完成冻结题组中的全部题目，否则返回 422 `SESSION_INCOMPLETE`，不更新任务、积分或复习间隔。完整结算按登录用户加锁，在同一事务中更新复习状态、不同新词进度、积分账本和会话完成状态。重复结算返回 `duplicate: true`，不再次执行副作用。

听力/阅读按一组计输入任务；如果该内容对应技能已到期，同时计一条复习。识义和拼写独立计复习。积分每项每日一次，合计仍上限 45 分。

### POST /api/spelling-attempts

首次有效拼写答案使用幂等键保存。到期的拼写才增加复习进度；重复提交不会推进间隔或重复增加积分。

### POST /api/open-submissions

同一账号、模块、题干和去除首尾空白后的相同正文，只保存一次作品。重复保存返回原作品、`duplicate: true` 和空奖励，不重复推进输出任务。自检勾选变化不产生第二次任务进度。

### 已停用的直接完成接口

`POST /api/me/tasks/input/complete` 返回 410 `SESSION_REQUIRED`；`POST /api/reviews/{id}/complete` 返回 410 `GRADED_ATTEMPT_REQUIRED`。客户端不能绕过真实题组或拼写作答直接上报任务完成。

## 错误结构

所有错误使用稳定错误码：

```json
{
  "error": {
    "code": "QUESTION_VERSION_MISMATCH",
    "message": "题目版本已经变化，请重新获取会话。",
    "details": {
      "expected": 2
    }
  }
}
```

## 当前边界

- 账号采用管理员邀请制，没有开放自助注册和邮件找回；忘记密码由管理员重置。
- 存储层实现了内存和 MySQL 两种驱动；通过 `STORAGE_DRIVER` 或 `DATABASE_URL` 切换，接口层无须改动。
- `npm run db:migrate` 会执行 `server/migrations/mysql/` 中尚未应用的迁移，并记录到 `schema_migrations`。
- MySQL 迁移已定义账号、内容版本、学习会话、作答、复习状态和积分账本；首次迁移会写入演示用户。
- 登录态使用 HttpOnly Cookie，业务接口从服务端会话获取用户身份。
