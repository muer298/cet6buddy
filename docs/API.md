# CET6 Buddy API V1 开发说明

## 当前接口

### GET /health

返回 API 健康状态与服务器 UTC 时间。

### GET /api/me/plan

返回按 Asia/Shanghai 生成的服务器日期、计划档位和五类今日任务。

### POST /api/study/sessions

创建个人练习会话并冻结题目列表与版本。返回给客户端的题目不包含正确答案和解析。

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

由服务器根据已确认作答计算正确数和得分。完成全部题目后尝试发放当天一次小游戏学习积分，`reward_key` 唯一约束防止重复发奖。

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

- 认证暂用固定演示用户，尚未接受真实身份令牌。
- 存储层实现了内存和 MySQL 两种驱动；通过 `STORAGE_DRIVER` 或 `DATABASE_URL` 切换，接口层无须改动。
- `npm run db:migrate` 会执行 `server/migrations/mysql/` 中尚未应用的迁移，并记录到 `schema_migrations`。
- MySQL 迁移已定义账号、内容版本、学习会话、作答、复习状态和积分账本；首次迁移会写入演示用户。
- 好友挑战、队伍权限、上传和发布接口尚未开放。
