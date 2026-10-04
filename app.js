const app = document.querySelector('#app');

const S = {
  route: location.hash.slice(1) || 'today',
  selected: null,
  toast: '',
  studyTab: '题目',
};

const icons = {
  today: '⌂', study: '▤', games: '◇', team: '♧', me: '○',
  word: 'Aa', listen: '◖', read: '¶', translate: '译', write: '✎',
};

const routes = {
  today: renderToday, study: renderStudy, games: renderGames, team: renderTeam, me: renderMe,
  word: renderWord, listening: renderListening, reading: renderReading, translation: renderTranslation,
  writing: renderWriting, rootgame: renderRootGame, flashgame: renderFlashGame, streakgame: renderStreakGame,
  challenge: renderChallenge, upload: renderUpload, login: renderLogin, onboarding: renderOnboarding,
  admin: renderAdmin, result: renderResult,
};

function statusbar() {
  return `<div class="statusbar"><span>09:41</span><div class="status-icons"><span>5G</span><span>▮▮▮</span><i class="status-dot"></i></div></div>`;
}

function topbar(title, subtitle = '', action = '⋯') {
  return `${statusbar()}<header class="topbar"><div>${subtitle ? `<p class="eyebrow">${subtitle}</p>` : ''}<h1>${title}</h1></div><button class="icon-btn" data-toast="这里是原型操作入口">${action}</button></header>`;
}

function detailTop(title, right = '☆') {
  return `${statusbar()}<header class="topbar"><button class="back" data-back>‹</button><h2>${title}</h2><button class="icon-btn" data-toast="已收藏到个人素材">${right}</button></header>`;
}

function nav(active) {
  const items = [['today','今日'],['study','学习'],['games','闯关'],['team','小队'],['me','我的']];
  return `<nav class="bottom-nav">${items.map(([r,label]) => `<button class="nav-item ${active===r?'active':''}" data-route="${r}"><b>${icons[r]}</b>${label}</button>`).join('')}</nav>`;
}

function shell(content, active, noNav = false) {
  return `<main class="phone-shell"><section class="page ${noNav?'no-nav':''}">${content}</section>${noNav?'':nav(active)}</main>`;
}

function task(icon, color, title, desc, meta, route, done=false) {
  return `<button class="task ${done?'done':''}" data-route="${route}"><span class="task-icon" style="background:${color}">${icon}</span><span class="task-copy"><strong>${title}</strong><small>${desc}</small></span><span class="task-meta">${meta}</span><span class="check">${done?'✓':''}</span></button>`;
}

function renderToday() {
  return shell(`${topbar('早上好，小词同学','10月3日 · 距离考试还有 78 天','◉')}
    <div class="sync-bar"><b>☁</b><span>昨晚的学习记录已同步。当前设备可以继续上次进度。</span></div>
    <section class="hero">
      <div class="hero-kicker">✦ 今日标准计划 · 35/45 分</div>
      <h2>今天再完成 2 项，就能点亮打卡</h2>
      <p>先完成到期复习，再选一组听力或阅读。小游戏不会影响打卡。</p>
      <div class="hero-row"><div class="hero-progress"><div class="progress-label"><span>今日进度</span><span>3 / 5</span></div><div class="track"><i style="width:62%"></i></div></div><button class="round-btn" data-route="word">›</button></div>
    </section>
    <div class="section-head"><h3>今日任务</h3><button data-toast="计划变更会从明天生效">调整计划</button></div>
    <div class="task-list">
      ${task('↻','#e9f8f2','到期复习','20 个词 · 已完成订正','10 分','word',true)}
      ${task('A','#eeebff','学习新词','10 个词 · 剩余 4 个','6/10','word')}
      ${task('◖','#eaf3ff','听力或阅读','任选一项完成','0/1','listening')}
      ${task('✎','#fff0e7','句式或翻译','积累 2 条表达','2/2','writing',true)}
      ${task('◇','#fff7df','小游戏','完成整局并订正','可选','games',true)}
    </div>
    <div class="section-head"><h3>小队在学</h3><button data-route="team">查看周榜</button></div>
    <button class="team-strip" data-route="team"><span class="rings"><i class="mini-avatar" style="background:#ffd8a8">柚</i><i class="mini-avatar" style="background:#c7ebff">林</i><i class="mini-avatar" style="background:#e5d6ff">乔</i></span><span><strong>3 位伙伴已完成今日计划</strong><small>本周共同目标 14 / 20 人次</small></span><span class="chev">›</span></button>`, 'today');
}

function renderStudy() {
  const module = (r,i,c,title,desc,count,wide='') => `<button class="module-card ${wide}" data-route="${r}"><span class="module-icon" style="background:${c}">${i}</span><span><h3>${title}</h3><p>${desc}</p></span><b class="count">${count}</b></button>`;
  return shell(`${topbar('学习中心','五类能力 · 共享同一复习进度','⌕')}
    <div class="chips"><button class="chip active">全部</button><button class="chip">待复习 26</button><button class="chip">收藏 18</button><button class="chip">错题 9</button></div>
    <div class="section-head"><h3>选择学习内容</h3><span class="pill">今日推荐</span></div>
    <div class="module-grid">
      ${module('word','Aa','#eeebff','单词','识义与拼写分开练','26 待复习')}
      ${module('listening','◖','#eaf3ff','听力','精听、复听与听写','2 题组')}
      ${module('reading','¶','#e8f8f2','阅读','文章位置自动保留','1 篇')}
      ${module('translation','译','#fff0e7','翻译','主题词汇与表达迁移','8 条')}
      ${module('writing','✎','#fff7df','作文句式','理解、回忆、改写与自检','5 到期','wide')}
    </div>
    <div class="feature-card"><div class="section-head" style="margin:0 0 8px"><h3>本周复习节奏</h3><span class="pill mint">稳定</span></div><p>你在 3 天间隔的词汇上表现最好。今天的错词会回到短间隔队列，不影响已经掌握的记录。</p></div>`, 'study');
}

function renderGames() {
  const game = (route,cls,num,tag,title,desc,meta) => `<button class="game-card ${cls}" data-route="${route}"><span class="game-num">${num}</span><span class="pill" style="background:rgba(255,255,255,.18);color:white">${tag}</span><h3>${title}</h3><p>${desc}</p><span class="game-footer"><small>${meta}</small><i class="play">▶</i></span></button>`;
  return shell(`${topbar('闯关','小游戏得分与学习积分分开记录','⚙')}
    <div class="chips"><button class="chip active">单人练习</button><button class="chip" data-route="challenge">好友挑战</button><button class="chip">历史最佳</button></div>
    <div class="section-head"><h3>选择玩法</h3><span class="pill orange">今日 +5</span></div>
    ${game('rootgame','purple','01','5 词一串','词根串串','先理解构词线索，再完成辨义、语境与回忆。','不限时 · 满分 50')}
    ${game('flashgame','blue','02','速度挑战','单词闪答','大单词、音标与四选一；音频未就绪不会消耗时间。','10 题 · 12 秒/题')}
    ${game('streakgame','orange','03','连胜加分','例句连胜','从真实语境判断词义，连续答对可获得额外局内分。','10 题 · 最高 115')}
    <button class="task" data-route="challenge"><span class="task-icon" style="background:#28243d;color:white">⚑</span><span class="task-copy"><strong>小队异步挑战</strong><small>截止前只显示完成状态，避免泄题</small></span><span class="pill">2 进行中</span></button>`, 'games');
}

function renderWord() {
  return shell(`${detailTop('单词复习','☆')}
    <div class="question-progress">${[1,2,3,4,5,6,7,8,9,10].map((x,i)=>`<i class="${i<5?'done':i===5?'now':''}"></i>`).join('')}</div>
    <div class="study-card"><span class="pill mint">到期复习 · 识义</span><div class="word">sustainable</div><div class="phonetic">/səˈsteɪnəbl/</div><button class="sound" data-toast="正在播放发音">◖</button><div class="hint-box"><b>回忆提示</b><br/>先在脑中说出最常见的语境义，再选择答案。词根只作为线索。</div></div>
    <div class="options">${['短暂而强烈的','可持续的；可维持的','难以察觉的','相互依赖的'].map((x,i)=>`<button class="option" data-option><span>${'ABCD'[i]}</span>${x}</button>`).join('')}</div>
    <button class="primary" data-submit disabled>确认答案</button>
    <button class="text-link" style="display:block;margin:15px auto" data-toast="该词会标记为需要更多提示">看提示后作答</button>`, 'study');
}

function renderListening() {
  return shell(`${detailTop('听力练习','⋯')}
    <div class="segmented"><button class="active">练习模式</button><button>测验模式</button></div>
    <div style="height:13px"></div><div class="audio-player"><div class="wave">${[18,28,42,22,49,34,26,45,19,38,51,29,20,40,24,34,48,21,37,28].map(h=>`<i style="height:${h}px"></i>`).join('')}</div><div class="player-row"><span>01:18 / 02:40</span><button class="player-control" data-toast="已暂停，播放位置会保留">Ⅱ</button><span>1.0× · 循环</span></div></div>
    <div class="section-head"><h3>第 2 题 / 共 5 题</h3><span class="pill">保留播放位置</span></div>
    <div class="feature-card" style="margin:0"><h3>What does the woman suggest the man do?</h3><p>可以重复播放当前段落。提交后才会显示答案、解析与相关原文。</p></div>
    <div class="options">${['Reschedule the meeting.','Contact the department.','Review the application.','Wait for another email.'].map((x,i)=>`<button class="option" data-option><span>${'ABCD'[i]}</span>${x}</button>`).join('')}</div>
    <button class="primary" data-submit disabled>提交答案</button>`, 'study');
}

function renderReading() {
  return shell(`${detailTop('仔细阅读','☆')}
    <div class="segmented"><button class="active" data-tab="文章">文章</button><button data-tab="题目">题目 2/5</button></div>
    <div style="height:12px"></div><article class="passage"><b>Why Small Habits Matter</b><br/><br/>People often assume that meaningful change requires dramatic action. Yet research on everyday behavior suggests that small, repeated choices can shape outcomes over time. <mark>Consistency matters more than a single burst of motivation</mark>, especially when a habit is tied to a stable cue...</article>
    <div class="section-head"><h3>阅读位置已保留</h3><span class="pill mint">62%</span></div>
    <div class="feature-card"><h3>收藏词句</h3><p>选中文字即可收藏。答题后还可以标记支持答案的证据句。</p></div>
    <button class="primary" data-toast="已切换到第 2 题">查看题目</button>`, 'study');
}

function renderTranslation() {
  return shell(`${detailTop('翻译积累','☆')}
    <div class="chips"><button class="chip active">文化</button><button class="chip">教育</button><button class="chip">科技</button><button class="chip">环境</button></div>
    <div class="feature-card"><span class="pill orange">搭配 · 到期复习</span><h3 style="font-size:20px;margin-top:18px">在……方面发挥重要作用</h3><p style="margin-top:8px">先独立回忆，再展开参考译法。多个自然表达都可以被保存。</p><button class="primary" data-toast="参考译法：play an important role in ...">显示参考译法</button></div>
    <div class="section-head"><h3>换一个语境使用</h3><span class="pill">开放输出</span></div>
    <div class="field"><label>科技发展</label><textarea class="input" style="min-height:110px;padding-top:14px" placeholder="用这个表达独立写一句英文……"></textarea></div>
    <div class="feature-card"><h3>自检清单</h3><p>□ 意义完整　□ 搭配自然　□ 符合当前语境<br/>开放表达只保存作品，不生成虚假的自动分数。</p></div>
    <button class="primary" data-toast="作品已保存为私人素材">保存我的表达</button>`, 'study');
}

function renderWriting() {
  return shell(`${detailTop('作文句式','☆')}
    <div class="question-progress">${[1,2,3,4,5].map((x,i)=>`<i class="${i<2?'done':i===2?'now':''}"></i>`).join('')}</div>
    <div class="feature-card" style="margin:0"><span class="pill">提出做法</span><h3 style="font-family:Georgia,serif;font-size:22px;line-height:1.5;margin-top:15px">One practical way to … is to …</h3><p>用于提出具体、可执行的方法。不要只追求长句，重点是意义完整且适合语境。</p></div>
    <div class="section-head"><h3>词块排序</h3><span class="pill gray">点击移动</span></div>
    <div class="chips" style="flex-wrap:wrap;overflow:visible">${['reading ability','is to','One practical way','to improve','read every day'].map(x=>`<button class="chip" data-toast="已移动词块：${x}">${x}</button>`).join('')}</div>
    <div class="hint-box" style="margin-top:15px;min-height:76px">在这里按顺序组合句子…</div>
    <button class="primary" data-toast="句式结构正确，接下来换话题改写">检查顺序</button>`, 'study');
}

function gameHeader(title, q, score, timer=true) {
  return `${statusbar()}<header class="topbar"><button class="back" data-back>×</button><div style="text-align:center"><p class="eyebrow">${q}</p><h2>${title}</h2></div>${timer?'<div class="timer"></div>':`<span class="pill">${score} 分</span>`}</header>`;
}

function renderRootGame() {
  return shell(`${gameHeader('词根串串','第 3 / 5 词','20',false)}
    <div class="question-progress">${[1,2,3,4,5].map((x,i)=>`<i class="${i<2?'done':i===2?'now':''}"></i>`).join('')}</div>
    <div class="study-card"><span class="pill">构词线索 · -less</span><div class="word">careless</div><div class="phonetic">care + less → 缺少关心或注意</div><button class="sound" data-toast="正在播放 careless">◖</button><div class="hint-box">注意：构词只能帮助回忆，实际语义仍需结合用法判断。</div></div>
    <div class="options">${['无忧无虑的','粗心的','漠不关心的','无能力的'].map((x,i)=>`<button class="option" data-option><span>${'ABCD'[i]}</span>${x}</button>`).join('')}</div>
    <button class="primary" data-submit disabled>锁定答案</button>`, 'games');
}

function renderFlashGame() {
  return shell(`${gameHeader('单词闪答','第 4 / 10 题','30')}
    <div class="question-progress">${[1,2,3,4,5,6,7,8,9,10].map((x,i)=>`<i class="${i<3?'done':i===3?'now':''}"></i>`).join('')}</div>
    <div class="study-card"><span class="pill mint">当前得分 30</span><div class="word">inevitable</div><div class="phonetic">/ɪnˈevɪtəbl/</div><button class="sound" data-toast="正在播放发音">◖</button></div>
    <div class="options">${['不可避免的','非常谨慎的','逐渐减少的','容易获得的'].map((x,i)=>`<button class="option" data-option><span>${'ABCD'[i]}</span>${x}</button>`).join('')}</div>
    <p class="eyebrow" style="text-align:center;margin-top:14px">首次有效答案将立即锁定</p>`, 'games');
}

function renderStreakGame() {
  return shell(`${gameHeader('例句连胜','第 7 / 10 题','70')}
    <div class="streak"><span style="font-size:30px">🔥</span><span><small>当前连胜</small><strong> 6 </strong><small>下一档 +5</small></span></div>
    <div class="sentence">Regular exercise can <em>alleviate</em> stress and improve overall well-being.</div>
    <div class="section-head"><h3>alleviate 在句中最接近</h3><span class="pill orange">隐藏译文</span></div>
    <div class="options">${['加剧','缓解','忽略','预测'].map((x,i)=>`<button class="option" data-option><span>${'ABCD'[i]}</span>${x}</button>`).join('')}</div>
    <button class="primary" data-submit disabled>提交并继续</button>`, 'games');
}

function renderChallenge() {
  return shell(`${detailTop('好友挑战','＋')}
    <div class="hero" style="background:linear-gradient(145deg,#28243d,#443d64)"><div class="hero-kicker">⚑ 截止前不公布成绩</div><h2>周末词汇闪答赛</h2><p>同一题目版本 · 10题 · 12秒/题<br/>截止：10月5日 22:00</p><div class="hero-row"><div class="hero-progress"><div class="progress-label"><span>完成情况</span><span>3 / 5 人</span></div><div class="track"><i style="width:60%"></i></div></div><button class="round-btn" data-route="flashgame">▶</button></div></div>
    <div class="section-head"><h3>成员状态</h3><span class="pill gray">不显示分数</span></div>
    <div class="leader-list">${[['柚子','已完成','#ffd8a8'],['小词同学','未开始','#e5d6ff'],['阿林','已完成','#c7ebff'],['乔乔','进行中','#d6f4de'],['Mia','已完成','#ffe2ec']].map((x,i)=>`<div class="leader"><span class="rank">${i+1}</span><i class="mini-avatar" style="margin:0;border:0;background:${x[2]}">${x[0][0]}</i><span><strong>${x[0]}</strong><small>${x[1]}</small></span><span class="pill ${x[1]==='已完成'?'mint':'gray'}">${x[1]}</span></div>`).join('')}</div>
    <button class="primary" data-route="flashgame">开始我的唯一一次计榜</button><p class="eyebrow" style="text-align:center">开始后退出，截止时间仍会继续</p>`, 'games');
}

function renderTeam() {
  return shell(`${topbar('六级上岸小队','本周一 00:00 起 · 5 位成员','＋')}
    <section class="hero" style="background:linear-gradient(145deg,#2c2940,#4b4568)"><div class="hero-kicker">共同目标 · 本周 20 人次打卡</div><h2>再完成 6 次，一起点亮本周徽章</h2><p>学习积分反映计划完成，不代表知识量或六级分数。</p><div class="hero-row"><div class="hero-progress"><div class="progress-label"><span>14 / 20</span><span>70%</span></div><div class="track"><i style="width:70%;background:#75e3bb"></i></div></div><button class="round-btn" data-toast="邀请码：CET6-27A（可重置）">⌁</button></div></section>
    <div class="section-head"><h3>本周小队榜</h3><span class="pill">标准/轻量均展示</span></div>
    <div class="leader-list">${[['1','柚子','标准计划','165','#ffd8a8'],['2','小词同学','标准计划','145','#e5d6ff'],['3','阿林','轻量计划','120','#c7ebff'],['4','乔乔','标准计划','95','#d6f4de'],['5','Mia','轻量计划','80','#ffe2ec']].map(x=>`<div class="leader"><span class="rank">${x[0]}</span><i class="mini-avatar" style="margin:0;border:0;background:${x[4]}">${x[1][0]}</i><span><strong>${x[1]}</strong><small>${x[2]} · 今日${+x[3]>100?'已打卡':'学习中'}</small></span><span class="score">${x[3]}</span></div>`).join('')}</div>
    <button class="task" style="margin-top:12px" data-route="challenge"><span class="task-icon" style="background:#fff0e7">⚑</span><span class="task-copy"><strong>周末词汇闪答赛</strong><small>3/5 人已完成 · 还有 2 天</small></span><span>›</span></button>`, 'team');
}

function renderMe() {
  return shell(`${topbar('我的','个人记录默认私有','⚙')}
    <div class="profile-card"><div class="avatar">词</div><div><h2>小词同学</h2><p>标准计划 · 已坚持 12 天 · 145 学习积分</p></div><span style="margin-left:auto">›</span></div>
    <div class="section-head"><h3>十月打卡</h3><span class="pill mint">本周 4 天</span></div>
    <div class="calendar"><div class="calendar-head"><b>2026年10月</b><span>‹　›</span></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(x=>`<span class="label">${x}</span>`).join('')}${Array.from({length:35},(_,i)=>`<span class="${[1,2,3,4,8,9,10,11,15,16].includes(i)?'checked':i===18?'today':''}">${i<3?'':i-2}</span>`).join('')}</div></div>
    <div class="section-head"><h3>学习资产</h3><button data-toast="导出功能将在接入后端后启用">导出记录</button></div>
    <div class="metric-row"><div class="metric"><strong>286</strong><small>已学词汇</small></div><div class="metric"><strong>18</strong><small>收藏表达</small></div><div class="metric"><strong>9</strong><small>待订正</small></div></div>
    <div class="section-head"><h3>设置与资料</h3></div><div class="menu-list">
      <button class="menu-item" data-route="upload"><b>⇧</b><span>我的资料与上传</span><small>›</small></button>
      <button class="menu-item" data-route="onboarding"><b>◎</b><span>每日计划与考试目标</span><small>标准 ›</small></button>
      <button class="menu-item" data-toast="公开范围：仅昵称、完成状态与积分"><b>♙</b><span>隐私与分享范围</span><small>›</small></button>
      <button class="menu-item" data-route="admin"><b>▦</b><span>内容管理后台示意</span><small>桌面端 ›</small></button>
    </div>`, 'me');
}

function renderUpload() {
  return shell(`${detailTop('我的资料','⋯')}
    <div class="sync-bar"><b>ⓘ</b><span>图片和 PDF 在 V1 中作为原始附件保存，不承诺自动转换成题库。</span></div>
    <div class="section-head"><h3>上传新资料</h3><span class="pill gray">私人可见</span></div>
    <button class="upload-zone" data-toast="请选择图片、PDF 或音频文件"><span style="font-size:30px">⇧</span><b>点击选择或拖入文件</b><p>图片 ≤ 10MB · PDF ≤ 20MB · 音频 ≤ 50MB<br/>系统会检查真实类型与可读性</p></button>
    <div class="section-head"><h3>最近资料</h3><button>全部</button></div>
    <div class="task-list">${task('PDF','#ffedf0','六级翻译主题整理.pdf','8.2 MB · 等待人工整理','草稿','upload')}${task('◖','#eaf3ff','2023听力练习.mp3','32.1 MB · 已关联 1 个题组','已发布','upload')}${task('TXT','#e8f8f2','作文句式摘录.txt','12 KB · 字段检查通过','待预览','upload')}</div>
    <button class="primary" data-toast="已创建空白手动录入草稿">手动录入内容</button>`, 'me');
}

function renderLogin() {
  return shell(`<div class="auth"><div class="brand"><div class="logo"><i class="logo-mark">B</i>CET6 Buddy</div><h1>把六级学习，变成每天都能完成的小进步。</h1><p>单词、听读、翻译与句式，和朋友一起稳稳积累。</p></div><div class="auth-card"><span class="pill">可以先浏览演示</span><h2 style="margin-top:14px">邮箱验证码登录</h2><p>登录后可保存学习记录、跨设备继续并加入小队。</p><div class="field"><label>邮箱</label><input class="input" value="learner@example.com" /></div><button class="primary" data-route="onboarding">发送验证码</button><button class="secondary" style="width:100%;margin-top:10px" data-route="today">先看看演示</button><p style="text-align:center">继续即表示同意服务条款与隐私说明</p></div></div>`, null, true);
}

function renderOnboarding() {
  return shell(`${statusbar()}<div class="topbar"><button class="back" data-back>‹</button><div></div><button class="text-link" data-route="today">稍后设置</button></div>
    <div class="step-dots"><i class="active"></i><i></i><i></i></div><span class="pill">首次设置 · 1/3</span><h1 style="font-size:30px;margin:16px 0 8px">选择适合你的每日节奏</h1><p style="color:var(--muted);line-height:1.7">计划是可以调整的起点，不是统一处方。变更会从次日生效。</p>
    <div class="task-list" style="margin-top:22px"><button class="task" data-option><span class="task-icon" style="background:#e8f8f2">☘</span><span class="task-copy"><strong>轻量计划</strong><small>忙碌日保持连续 · 约 15 分钟</small></span><span class="check"></span></button><button class="task selected" data-option><span class="task-icon" style="background:#eeebff">✦</span><span class="task-copy"><strong>标准计划</strong><small>20 复习词 + 10 新词 + 2 项专项</small></span><span class="check">✓</span></button><button class="task" data-option><span class="task-icon" style="background:#fff0e7">⚙</span><span class="task-copy"><strong>自定义计划</strong><small>分别设置每类任务数量</small></span><span class="check"></span></button></div>
    <div class="field"><label>考试日期（可选）</label><input class="input" type="date" value="2026-12-19" /></div><button class="primary" data-route="today">保存并开始</button>`, null, true);
}

function renderResult() {
  return shell(`${statusbar()}<div style="text-align:center;padding-top:40px"><div style="font-size:70px">🎉</div><p class="eyebrow">本局完成</p><h1 style="font-size:30px;margin:8px">8 / 10 题正确</h1><p style="color:var(--muted)">单词闪答 · 80 局内分</p></div><div class="metric-row" style="margin-top:28px"><div class="metric"><strong>80</strong><small>本局得分</small></div><div class="metric"><strong>9s</strong><small>平均用时</small></div><div class="metric"><strong>2</strong><small>需要复习</small></div></div><div class="feature-card"><h3>下一步建议</h3><p>先订正 <b>inevitable</b> 和 <b>conventional</b>，再把它们加入明天的短间隔复习。完成订正后可领取今日一次小游戏学习积分。</p></div><button class="primary" data-route="word">订正 2 个词</button><button class="secondary" style="width:100%;margin-top:10px" data-route="games">返回闯关</button>`, null, true);
}

function renderAdmin() {
  const rows = [['2023年12月听力一','听力题组','已发布','v3'],['核心词汇 Week 04','词书','待预览','v1'],['中国传统节日','翻译主题','草稿','—'],['环境保护句式组','作文句式','已下架','v2']];
  return `<div class="admin-shell"><aside class="admin-side"><div class="logo"><i class="logo-mark">B</i>CET6 Buddy</div>${['概览','内容库','题组管理','资料导入','音频资源','发布记录','权限与审计'].map((x,i)=>`<span class="admin-link ${i===1?'active':''}">${x}</span>`).join('')}<span class="admin-link" data-route="me">← 返回手机端</span></aside><main class="admin-main"><div class="admin-top"><div><p class="eyebrow">内容管理后台 · 桌面优先</p><h1>内容库</h1></div><div><button class="secondary" data-route="me">手机端</button> <button class="secondary" data-toast="批量导入草稿已创建">＋ 新建内容</button></div></div><div class="admin-stats"><div class="admin-stat"><span class="pill mint">已发布</span><strong>1,284</strong><small>内容项目</small></div><div class="admin-stat"><span class="pill orange">待检查</span><strong>18</strong><small>字段或预览</small></div><div class="admin-stat"><span class="pill">今日新增</span><strong>36</strong><small>导入草稿</small></div><div class="admin-stat"><span class="pill gray">引用中</span><strong>42</strong><small>媒体资源</small></div></div><div style="display:flex;gap:10px;margin-bottom:14px"><input class="input" style="max-width:360px" placeholder="搜索标题、来源或标签"/><button class="secondary">筛选</button></div><div class="data-table"><div class="data-row header"><span>内容名称</span><span>类型</span><span>状态</span><span>版本</span><span>操作</span></div>${rows.map(r=>`<div class="data-row"><strong>${r[0]}</strong><span>${r[1]}</span><span><i class="pill ${r[2]==='已发布'?'mint':r[2]==='待预览'?'orange':'gray'}">${r[2]}</i></span><span>${r[3]}</span><button class="text-link" data-toast="打开内容详情">编辑</button></div>`).join('')}</div><div class="feature-card"><h3>发布流程</h3><p>草稿 → 字段检查 → 人工预览核对 → 发布 → 下架或新版本。已发布内容的修改会生成新版本，历史成绩继续引用旧版本。</p></div></main></div>`;
}

function render() {
  S.route = location.hash.slice(1) || S.route || 'today';
  const view = routes[S.route] || renderToday;
  app.innerHTML = `<div class="app-frame">${view()}</div>${S.toast?`<div class="toast">${S.toast}</div>`:''}`;
  bind();
}

function go(route) { S.selected = null; location.hash = route; }
function showToast(message) { S.toast = message; render(); setTimeout(()=>{ S.toast=''; render(); }, 1800); }

function bind() {
  document.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click',()=>go(el.dataset.route)));
  document.querySelectorAll('[data-back]').forEach(el => el.addEventListener('click',()=>history.length>1?history.back():go('today')));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click',()=>showToast(el.dataset.toast)));
  document.querySelectorAll('[data-option]').forEach((el,idx)=>el.addEventListener('click',()=>{
    document.querySelectorAll('[data-option]').forEach(x=>x.classList.remove('selected'));
    el.classList.add('selected'); S.selected=idx;
    const submit=document.querySelector('[data-submit]'); if(submit) submit.disabled=false;
  }));
  const submit=document.querySelector('[data-submit]'); if(submit) submit.addEventListener('click',()=>{
    const opts=[...document.querySelectorAll('[data-option]')];
    if(opts[S.selected]) opts[S.selected].classList.add(S.selected===1?'correct':'wrong');
    setTimeout(()=>go('result'),450);
  });
}

window.addEventListener('hashchange', render);
render();
