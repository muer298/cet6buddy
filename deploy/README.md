# 腾讯云香港试用环境部署

1. 在香港轻量应用服务器安装 Node.js 24、Nginx，并创建无登录权限的 `cet6` 用户。
2. 把 `production.env.example` 复制到 `/etc/cet6-buddy/production.env`，权限设为 `600`，填写香港 MySQL、COS 和域名配置。当前版本使用管理员创建账号与密码登录，不依赖 SES。
3. 对目标云 MySQL 先运行 `npm run db:migrate`；迁移是只向前执行的，禁止改写已经执行的 SQL。
4. 通过临时环境变量运行 `npm run admin:bootstrap` 创建首个管理员；不要把初始密码写入 Git，首次登录后必须修改。
5. 将 `cet6-buddy.service` 安装到 systemd，将 `nginx.conf` 中域名和证书路径替换为真实值。
6. 构建后运行 `release.sh`。发布采用不可变 release 目录和原子软链接，失败时运行 `rollback.sh`。
7. 用腾讯云数据库自动备份作为主备份；`backup-mysql.sh` 可作为额外每日逻辑备份。首次试用前必须把备份恢复到隔离数据库并执行 `npm run test:server` 与关键接口冒烟测试。

生产环境必须使用 HTTPS 和 `COOKIE_SECURE=true`。普通附件与音频使用 COS 私有桶，永久密钥只能存在服务器环境文件中。
