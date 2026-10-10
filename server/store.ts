import { randomUUID } from 'node:crypto';
import type { AssetRecord, AuthSessionRecord, ChallengeParticipation, ChallengeRecord, CollectionEntry, ContentRecord, DailyTaskState, GameAttemptRecord, GameSessionRecord, GameType, ImportRecord, OpenSubmission, PasswordCredential, PointEntry, ReviewSkill, ReviewState, StoredAttempt, StudySession, TeamRecord, UserAccount, UserRole } from './types.ts';

const taskDefinitions: Record<UserAccount['planTier'], Array<Omit<DailyTaskState, 'completed'>>> = {
  light: [
    { key: 'review', title: '到期复习', required: true, target: 10, points: 10 },
    { key: 'new_words', title: '学习新词', required: true, target: 5, points: 10 },
    { key: 'input', title: '听力或阅读', required: true, target: 1, points: 10 },
    { key: 'output', title: '句式或翻译', required: true, target: 1, points: 10 },
    { key: 'game', title: '小游戏', required: false, target: 1, points: 5 },
  ],
  standard: [
    { key: 'review', title: '到期复习', required: true, target: 20, points: 10 },
    { key: 'new_words', title: '学习新词', required: true, target: 10, points: 10 },
    { key: 'input', title: '听力或阅读', required: true, target: 1, points: 10 },
    { key: 'output', title: '句式或翻译', required: true, target: 2, points: 10 },
    { key: 'game', title: '小游戏', required: false, target: 1, points: 5 },
  ],
  custom: [
    { key: 'review', title: '到期复习', required: true, target: 20, points: 10 },
    { key: 'new_words', title: '学习新词', required: true, target: 10, points: 10 },
    { key: 'input', title: '听力或阅读', required: true, target: 1, points: 10 },
    { key: 'output', title: '句式或翻译', required: true, target: 2, points: 10 },
    { key: 'game', title: '小游戏', required: false, target: 1, points: 5 },
  ],
};

export function dailyTaskDefinitions(tier: UserAccount['planTier']): Array<Omit<DailyTaskState, 'completed'>> {
  return taskDefinitions[tier].map(task => ({ ...task }));
}

export function nextReviewInterval(previous: number, correct: boolean): number {
  if (!correct) return 1;
  return [1, 3, 7, 14, 30].find(days => days > previous) ?? 30;
}

export interface StudyStore {
  learningActivity(userId: string): Promise<Array<StoredAttempt & { source: string; corrected: boolean }>>;
  learningTotals(userId: string, start: string, end: string): Promise<{ practicedWords: number; todayPoints: number }>;
  createSession(input: Omit<StudySession, 'id' | 'createdAt' | 'status'>): Promise<StudySession>;
  getSession(sessionId: string): Promise<StudySession | undefined>;
  saveAttempt(input: Omit<StoredAttempt, 'id' | 'submittedAt'>): Promise<{ attempt: StoredAttempt; duplicate: boolean }>;
  attemptsForSession(sessionId: string): Promise<StoredAttempt[]>;
  finishSession(sessionId: string): Promise<StudySession | undefined>;
  awardPoints(userId: string, rewardKey: string, points: number, reason: string): Promise<{ entry: PointEntry; awarded: boolean }>;
  findUserByEmail(email: string): Promise<UserAccount | undefined>;
  findUserByUsername(username: string): Promise<UserAccount | undefined>;
  findUserById(userId: string): Promise<UserAccount | undefined>;
  createUser(email: string, nickname: string): Promise<UserAccount>;
  createPasswordUser(input: { username: string; email: string; nickname: string; role: UserRole; passwordHash: string; mustChangePassword: boolean }): Promise<UserAccount>;
  findPasswordCredential(identifier: string): Promise<PasswordCredential | undefined>;
  updatePassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<UserAccount | undefined>;
  listUsers(): Promise<UserAccount[]>;
  revokeUserSessions(userId: string, revokedAt: string): Promise<void>;
  countRateLimitEvents(scope: string, scopeKey: string, since: string): Promise<number>;
  recordRateLimitEvent(scope: string, scopeKey: string): Promise<void>;
  createAuthSession(input: Omit<AuthSessionRecord, 'id' | 'createdAt' | 'lastSeenAt'>): Promise<AuthSessionRecord>;
  findAuthSession(tokenHash: string): Promise<AuthSessionRecord | undefined>;
  touchAuthSession(sessionId: string, seenAt: string): Promise<void>;
  revokeAuthSession(tokenHash: string, revokedAt: string): Promise<void>;
  listReviews(userId: string, dueBefore: string): Promise<ReviewState[]>;
  updateReviewState(userId: string, contentItemId: string, skill: ReviewSkill, correct: boolean, reviewedAt: string): Promise<ReviewState>;
  listCollections(userId: string, kind?: string): Promise<CollectionEntry[]>;
  addCollection(input: Omit<CollectionEntry, 'id' | 'createdAt'>): Promise<CollectionEntry>;
  saveCorrection(userId: string, attemptId: string, correctedAnswer: unknown, selfCheck?: Record<string, boolean>): Promise<boolean>;
  saveSpellingAttempt(input: { userId: string; contentItemId: string; contentVersion: number; answerText: string; correct: boolean; idempotencyKey: string }): Promise<{ id: string; correct: boolean; duplicate: boolean }>;
  getDailyTasks(userId: string, planDate: string, tier: UserAccount['planTier']): Promise<DailyTaskState[]>;
  incrementDailyTask(userId: string, planDate: string, taskKey: DailyTaskState['key'], amount: number, tier: UserAccount['planTier']): Promise<DailyTaskState[]>;
  saveOpenSubmission(input: Omit<OpenSubmission, 'id' | 'createdAt'>): Promise<OpenSubmission>;
  getPlanTier(userId: string, planDate: string): Promise<UserAccount['planTier']>;
  schedulePlan(userId: string, tier: UserAccount['planTier'], effectiveDate: string, examDate?: string): Promise<void>;
  getCheckin(userId: string, planDate: string): Promise<{ id: string; userId: string; checkinDate: string; planTier: UserAccount['planTier']; createdAt: string } | undefined>;
  createCheckin(userId: string, planDate: string, tier: UserAccount['planTier']): Promise<{ id: string; userId: string; checkinDate: string; planTier: UserAccount['planTier']; createdAt: string }>;
  createGameSession(input: { userId: string; gameType: GameType; mode: GameSessionRecord['mode']; questionIds: string[]; questionVersions?: Record<string, number>; rules: GameSessionRecord['rules'] }): Promise<GameSessionRecord>;
  getGameSession(sessionId: string): Promise<GameSessionRecord | undefined>;
  submitGameAnswer(input: { gameSessionId: string; userId: string; questionId: string; questionVersion: number; answerIndex: number | null; correct: boolean; idempotencyKey: string }): Promise<{ attempt: GameAttemptRecord; session: GameSessionRecord; duplicate: boolean }>;
  gameAttempts(sessionId: string): Promise<GameAttemptRecord[]>;
  finishGameSession(sessionId: string): Promise<GameSessionRecord | undefined>;
  createTeam(input: { name: string; ownerId: string; inviteCode: string; inviteExpiresAt: string }): Promise<TeamRecord>;
  joinTeam(inviteCode: string, userId: string): Promise<TeamRecord | undefined>;
  getTeamOverview(userId: string, weekStart: string): Promise<{ team: TeamRecord; members: Array<{ userId: string; nickname: string; planTier: UserAccount['planTier']; points: number; role: 'owner' | 'member' }> } | undefined>;
  createReaction(teamId: string, senderId: string, receiverId: string, messageKey: string): Promise<{ id: string; createdAt: string }>;
  createChallenge(input: Omit<ChallengeRecord, 'id' | 'createdAt' | 'status'>): Promise<ChallengeRecord>;
  listChallenges(teamId: string): Promise<ChallengeRecord[]>;
  getChallenge(challengeId: string): Promise<ChallengeRecord | undefined>;
  startChallenge(challengeId: string, userId: string): Promise<{ participation: ChallengeParticipation; game: GameSessionRecord; duplicate: boolean }>;
  finishChallengeParticipation(challengeId: string, userId: string, game: GameSessionRecord): Promise<ChallengeParticipation | undefined>;
  setUserRole(userId: string, role: UserRole): Promise<UserAccount | undefined>;
  createAsset(input: Omit<AssetRecord, 'id' | 'createdAt'>): Promise<AssetRecord>;
  getAsset(assetId: string): Promise<AssetRecord | undefined>;
  createImport(ownerId: string, assetId: string): Promise<ImportRecord>;
  listImports(userId: string, all: boolean): Promise<Array<{ import: ImportRecord; asset: AssetRecord }>>;
  updateImport(importId: string, status: ImportRecord['status'], reviewerId?: string, errors?: string[]): Promise<ImportRecord | undefined>;
  createContent(input: { kind: string; ownerId?: string; visibility: ContentRecord['visibility']; payload: Record<string, unknown> }): Promise<ContentRecord>;
  createContentVersion(contentItemId: string, payload: Record<string, unknown>): Promise<ContentRecord | undefined>;
  listContent(): Promise<ContentRecord[]>;
  listPublishedContent(kind: string, userId?: string): Promise<ContentRecord[]>;
  getContentVersion(id: string, version: number): Promise<ContentRecord | undefined>;
  updateContentStatus(contentItemId: string, version: number, status: ContentRecord['status'], actorUserId: string, reason?: string): Promise<ContentRecord | undefined>;
  close?(): Promise<void>;
}

export class InMemoryStore implements StudyStore {
  async learningActivity(userId: string) {
    return [...this.attempts.values()].filter(a => a.userId === userId && this.sessions.get(a.sessionId)?.mode === 'practice')
      .map(a => ({ ...a, source: this.sessions.get(a.sessionId)!.source, corrected: this.corrections.has(a.id) }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }

  async learningTotals(userId: string, start: string, end: string) {
    const words = new Set((await this.learningActivity(userId)).filter(a => !a.questionId.includes(':') && !['reading', 'listening'].includes(a.source)).map(a => a.questionId));
    for (const a of this.spellingAttempts.values()) if (a.userId === userId) words.add(a.contentItemId);
    const todayPoints = [...this.pointLedger.values()].filter(p => p.userId === userId && p.createdAt >= start && p.createdAt < end).reduce((sum, p) => sum + p.points, 0);
    return { practicedWords: words.size, todayPoints };
  }
  readonly sessions = new Map<string, StudySession>();
  readonly attempts = new Map<string, StoredAttempt>();
  readonly attemptsByIdempotency = new Map<string, StoredAttempt>();
  readonly attemptBySessionQuestion = new Map<string, StoredAttempt>();
  readonly pointLedger = new Map<string, PointEntry>();
  readonly users = new Map<string, UserAccount>();
  readonly passwordHashes = new Map<string, string>();
  readonly rateLimitEvents: Array<{ scope: string; scopeKey: string; createdAt: string }> = [];
  readonly authSessions = new Map<string, AuthSessionRecord>();
  readonly reviews = new Map<string, ReviewState>();
  readonly collections = new Map<string, CollectionEntry>();
  readonly corrections = new Map<string, { userId: string; correctedAnswer: unknown; selfCheck?: Record<string, boolean>; createdAt: string }>();
  readonly spellingAttempts = new Map<string, { id: string; userId: string; contentItemId: string; contentVersion: number; answerText: string; correct: boolean; idempotencyKey: string; submittedAt: string }>();
  readonly dailyTasks = new Map<string, DailyTaskState[]>();
  readonly openSubmissions = new Map<string, OpenSubmission>();
  readonly pendingPlans = new Map<string, { tier: UserAccount['planTier']; effectiveDate: string; examDate?: string }>();
  readonly checkins = new Map<string, { id: string; userId: string; checkinDate: string; planTier: UserAccount['planTier']; createdAt: string }>();
  readonly gameSessions = new Map<string, GameSessionRecord>();
  readonly gameAttemptMap = new Map<string, GameAttemptRecord>();
  readonly gameAttemptByKey = new Map<string, GameAttemptRecord>();
  readonly teams = new Map<string, TeamRecord>();
  readonly memberships = new Map<string, { teamId: string; userId: string; role: 'owner' | 'member'; status: 'active' | 'left' | 'removed'; joinedAt: string }>();
  readonly challenges = new Map<string, ChallengeRecord>();
  readonly reactions = new Map<string, { id: string; teamId: string; senderId: string; receiverId: string; messageKey: string; createdAt: string }>();
  readonly participations = new Map<string, ChallengeParticipation>();
  readonly assets = new Map<string, AssetRecord>();
  readonly imports = new Map<string, ImportRecord>();
  readonly content = new Map<string, ContentRecord[]>();

  async createSession(input: Omit<StudySession, 'id' | 'createdAt' | 'status'>): Promise<StudySession> {
    const session: StudySession = { ...input, id: randomUUID(), status: 'active', createdAt: new Date().toISOString() };
    this.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<StudySession | undefined> {
    return this.sessions.get(sessionId);
  }

  async saveAttempt(input: Omit<StoredAttempt, 'id' | 'submittedAt'>): Promise<{ attempt: StoredAttempt; duplicate: boolean }> {
    const byKey = this.attemptsByIdempotency.get(input.idempotencyKey);
    if (byKey) return { attempt: byKey, duplicate: true };

    const questionKey = `${input.sessionId}:${input.questionId}`;
    const firstAnswer = this.attemptBySessionQuestion.get(questionKey);
    if (firstAnswer) return { attempt: firstAnswer, duplicate: true };

    const attempt: StoredAttempt = { ...input, id: randomUUID(), submittedAt: new Date().toISOString() };
    this.attempts.set(attempt.id, attempt);
    this.attemptsByIdempotency.set(attempt.idempotencyKey, attempt);
    this.attemptBySessionQuestion.set(questionKey, attempt);
    return { attempt, duplicate: false };
  }

  async attemptsForSession(sessionId: string): Promise<StoredAttempt[]> {
    return [...this.attempts.values()].filter(attempt => attempt.sessionId === sessionId);
  }

  async finishSession(sessionId: string): Promise<StudySession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.status === 'active') {
      session.status = 'finished';
      session.finishedAt = new Date().toISOString();
    }
    return session;
  }

  async awardPoints(userId: string, rewardKey: string, points: number, reason: string): Promise<{ entry: PointEntry; awarded: boolean }> {
    const previous = this.pointLedger.get(rewardKey);
    if (previous) return { entry: previous, awarded: false };
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const earned = [...this.pointLedger.values()].filter(item => item.userId === userId && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.createdAt)) === today).reduce((sum, item) => sum + item.points, 0);
    const granted = Math.max(0, Math.min(points, 45 - earned));
    const entry: PointEntry = { id: randomUUID(), userId, rewardKey, points: granted, reason, createdAt: new Date().toISOString() };
    if (!granted) return { entry, awarded: false };
    this.pointLedger.set(rewardKey, entry);
    return { entry, awarded: true };
  }

  async findUserByEmail(email: string): Promise<UserAccount | undefined> {
    return [...this.users.values()].find(user => user.email === email);
  }

  async findUserByUsername(username: string): Promise<UserAccount | undefined> {
    return [...this.users.values()].find(user => user.username === username);
  }

  async findUserById(userId: string): Promise<UserAccount | undefined> {
    return this.users.get(userId);
  }

  async createUser(email: string, nickname: string): Promise<UserAccount> {
    const existing = await this.findUserByEmail(email);
    if (existing) return existing;
    const user: UserAccount = {
      id: randomUUID(), username: email.split('@')[0], email, nickname, role: 'learner', mustChangePassword: true, status: 'active', planTier: 'standard', timezone: 'Asia/Shanghai', createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async createPasswordUser(input: { username: string; email: string; nickname: string; role: UserRole; passwordHash: string; mustChangePassword: boolean }): Promise<UserAccount> {
    if (await this.findUserByEmail(input.email) || await this.findUserByUsername(input.username)) throw new Error('USER_ALREADY_EXISTS');
    const user: UserAccount = {
      id: randomUUID(), username: input.username, email: input.email, nickname: input.nickname, role: input.role,
      mustChangePassword: input.mustChangePassword, status: 'active', planTier: 'standard', timezone: 'Asia/Shanghai', createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.passwordHashes.set(user.id, input.passwordHash);
    return user;
  }

  async findPasswordCredential(identifier: string): Promise<PasswordCredential | undefined> {
    const user = await this.findUserByEmail(identifier) ?? await this.findUserByUsername(identifier);
    const passwordHash = user ? this.passwordHashes.get(user.id) : undefined;
    return user && passwordHash ? { user, passwordHash } : undefined;
  }

  async updatePassword(userId: string, passwordHash: string, mustChangePassword: boolean): Promise<UserAccount | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    this.passwordHashes.set(userId, passwordHash);
    user.mustChangePassword = mustChangePassword;
    return user;
  }

  async listUsers(): Promise<UserAccount[]> {
    return [...this.users.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async revokeUserSessions(userId: string, revokedAt: string): Promise<void> {
    for (const session of this.authSessions.values()) if (session.userId === userId && !session.revokedAt) session.revokedAt = revokedAt;
  }

  async countRateLimitEvents(scope: string, scopeKey: string, since: string): Promise<number> {
    return this.rateLimitEvents.filter(event => event.scope === scope && event.scopeKey === scopeKey && event.createdAt >= since).length;
  }

  async recordRateLimitEvent(scope: string, scopeKey: string): Promise<void> {
    this.rateLimitEvents.push({ scope, scopeKey, createdAt: new Date().toISOString() });
  }

  async createAuthSession(input: Omit<AuthSessionRecord, 'id' | 'createdAt' | 'lastSeenAt'>): Promise<AuthSessionRecord> {
    const now = new Date().toISOString();
    const session: AuthSessionRecord = { ...input, id: randomUUID(), createdAt: now, lastSeenAt: now };
    this.authSessions.set(session.id, session);
    return session;
  }

  async findAuthSession(tokenHash: string): Promise<AuthSessionRecord | undefined> {
    return [...this.authSessions.values()].find(session => session.tokenHash === tokenHash && !session.revokedAt);
  }

  async touchAuthSession(sessionId: string, seenAt: string): Promise<void> {
    const session = this.authSessions.get(sessionId);
    if (session) session.lastSeenAt = seenAt;
  }

  async revokeAuthSession(tokenHash: string, revokedAt: string): Promise<void> {
    const session = await this.findAuthSession(tokenHash);
    if (session) session.revokedAt = revokedAt;
  }

  async listReviews(userId: string, dueBefore: string): Promise<ReviewState[]> {
    return [...this.reviews.values()].filter(review => review.userId === userId && review.dueAt <= dueBefore).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  async updateReviewState(userId: string, contentItemId: string, skill: ReviewSkill, correct: boolean, reviewedAt: string): Promise<ReviewState> {
    const key = `${userId}:${contentItemId}:${skill}`;
    const previous = this.reviews.get(key);
    const intervalDays = nextReviewInterval(previous?.intervalDays ?? 0, correct);
    const due = new Date(reviewedAt);
    due.setUTCDate(due.getUTCDate() + intervalDays);
    const review: ReviewState = { userId, contentItemId, skill, intervalDays, dueAt: due.toISOString(), updatedAt: reviewedAt };
    this.reviews.set(key, review);
    return review;
  }

  async listCollections(userId: string, kind?: string): Promise<CollectionEntry[]> {
    return [...this.collections.values()].filter(item => item.userId === userId && (!kind || item.kind === kind));
  }

  async addCollection(input: Omit<CollectionEntry, 'id' | 'createdAt'>): Promise<CollectionEntry> {
    const existing = [...this.collections.values()].find(item => item.userId === input.userId && item.contentItemId === input.contentItemId && item.kind === input.kind);
    if (existing) return existing;
    const entry: CollectionEntry = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.collections.set(entry.id, entry);
    return entry;
  }

  async saveCorrection(userId: string, attemptId: string, correctedAnswer: unknown, selfCheck?: Record<string, boolean>): Promise<boolean> {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.userId !== userId) return false;
    if (!this.corrections.has(attemptId)) this.corrections.set(attemptId, { userId, correctedAnswer, selfCheck, createdAt: new Date().toISOString() });
    return true;
  }

  async saveSpellingAttempt(input: { userId: string; contentItemId: string; contentVersion: number; answerText: string; correct: boolean; idempotencyKey: string }) {
    const previous = [...this.spellingAttempts.values()].find(item => item.idempotencyKey === input.idempotencyKey);
    if (previous) return { id: previous.id, correct: previous.correct, duplicate: true };
    const attempt = { ...input, id: randomUUID(), submittedAt: new Date().toISOString() };
    this.spellingAttempts.set(attempt.id, attempt);
    return { id: attempt.id, correct: attempt.correct, duplicate: false };
  }

  async getDailyTasks(userId: string, planDate: string, tier: UserAccount['planTier']): Promise<DailyTaskState[]> {
    const key = `${userId}:${planDate}`;
    const existing = this.dailyTasks.get(key);
    if (existing) return existing.map(task => ({ ...task }));
    const tasks = dailyTaskDefinitions(tier).map(task => ({ ...task, completed: 0 }));
    this.dailyTasks.set(key, tasks);
    return tasks.map(task => ({ ...task }));
  }

  async incrementDailyTask(userId: string, planDate: string, taskKey: DailyTaskState['key'], amount: number, tier: UserAccount['planTier']): Promise<DailyTaskState[]> {
    const tasks = await this.getDailyTasks(userId, planDate, tier);
    const task = tasks.find(item => item.key === taskKey);
    if (task) {
      task.completed = Math.min(task.target, task.completed + amount);
      if (task.completed >= task.target && !task.completedAt) task.completedAt = new Date().toISOString();
    }
    this.dailyTasks.set(`${userId}:${planDate}`, tasks);
    return tasks.map(item => ({ ...item }));
  }

  async saveOpenSubmission(input: Omit<OpenSubmission, 'id' | 'createdAt'>): Promise<OpenSubmission> {
    const entry: OpenSubmission = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.openSubmissions.set(entry.id, entry);
    return entry;
  }

  async getPlanTier(userId: string, planDate: string): Promise<UserAccount['planTier']> {
    const user = this.users.get(userId);
    if (!user) return 'standard';
    const pending = this.pendingPlans.get(userId);
    if (pending && pending.effectiveDate <= planDate) {
      user.planTier = pending.tier;
      user.examDate = pending.examDate ?? user.examDate;
      this.pendingPlans.delete(userId);
    }
    return user.planTier;
  }

  async schedulePlan(userId: string, tier: UserAccount['planTier'], effectiveDate: string, examDate?: string): Promise<void> {
    this.pendingPlans.set(userId, { tier, effectiveDate, examDate });
  }

  async getCheckin(userId: string, planDate: string) {
    return this.checkins.get(`${userId}:${planDate}`);
  }

  async createCheckin(userId: string, planDate: string, planTier: UserAccount['planTier']) {
    const previous = await this.getCheckin(userId, planDate);
    if (previous) return previous;
    const checkin = { id: randomUUID(), userId, checkinDate: planDate, planTier, createdAt: new Date().toISOString() };
    this.checkins.set(`${userId}:${planDate}`, checkin);
    return checkin;
  }

  async createGameSession(input: { userId: string; gameType: GameType; mode: GameSessionRecord['mode']; questionIds: string[]; questionVersions?: Record<string, number>; rules: GameSessionRecord['rules'] }): Promise<GameSessionRecord> {
    const session: GameSessionRecord = { ...input, id: randomUUID(), status: 'active', score: 0, correctCount: 0, currentStreak: 0, longestStreak: 0, createdAt: new Date().toISOString() };
    this.gameSessions.set(session.id, session);
    return session;
  }

  async getGameSession(sessionId: string): Promise<GameSessionRecord | undefined> {
    return this.gameSessions.get(sessionId);
  }

  async submitGameAnswer(input: { gameSessionId: string; userId: string; questionId: string; questionVersion: number; answerIndex: number | null; correct: boolean; idempotencyKey: string }): Promise<{ attempt: GameAttemptRecord; session: GameSessionRecord; duplicate: boolean }> {
    const keyed = this.gameAttemptByKey.get(input.idempotencyKey) ?? this.gameAttemptByKey.get(`${input.gameSessionId}:${input.questionId}`);
    const session = this.gameSessions.get(input.gameSessionId);
    if (!session) throw new Error('GAME_SESSION_NOT_FOUND');
    if (keyed) return { attempt: keyed, session, duplicate: true };
    const nextStreak = input.correct ? session.currentStreak + 1 : 0;
    const bonus = session.gameType === 'streak' && input.correct && [3, 6, 9].includes(nextStreak) ? 5 : 0;
    const attempt: GameAttemptRecord = { ...input, id: randomUUID(), points: input.correct ? 10 + bonus : 0, submittedAt: new Date().toISOString() };
    this.gameAttemptMap.set(attempt.id, attempt);
    this.gameAttemptByKey.set(input.idempotencyKey, attempt);
    this.gameAttemptByKey.set(`${input.gameSessionId}:${input.questionId}`, attempt);
    session.score += attempt.points;
    session.correctCount += input.correct ? 1 : 0;
    session.currentStreak = nextStreak;
    session.longestStreak = Math.max(session.longestStreak, nextStreak);
    return { attempt, session, duplicate: false };
  }

  async gameAttempts(sessionId: string): Promise<GameAttemptRecord[]> {
    return [...this.gameAttemptMap.values()].filter(attempt => attempt.gameSessionId === sessionId).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  async finishGameSession(sessionId: string): Promise<GameSessionRecord | undefined> {
    const session = this.gameSessions.get(sessionId);
    if (!session) return undefined;
    session.status = 'finished';
    session.finishedAt ??= new Date().toISOString();
    return session;
  }

  async createTeam(input: { name: string; ownerId: string; inviteCode: string; inviteExpiresAt: string }): Promise<TeamRecord> {
    const team: TeamRecord = { ...input, id: randomUUID(), memberLimit: 6, goalTarget: 20, createdAt: new Date().toISOString() };
    this.teams.set(team.id, team);
    this.memberships.set(`${team.id}:${input.ownerId}`, { teamId: team.id, userId: input.ownerId, role: 'owner', status: 'active', joinedAt: team.createdAt });
    return team;
  }

  async joinTeam(inviteCode: string, userId: string): Promise<TeamRecord | undefined> {
    const team = [...this.teams.values()].find(item => item.inviteCode === inviteCode && item.inviteExpiresAt > new Date().toISOString());
    if (!team) return undefined;
    const members = [...this.memberships.values()].filter(item => item.teamId === team.id && item.status === 'active');
    if (members.length >= team.memberLimit) return undefined;
    this.memberships.set(`${team.id}:${userId}`, { teamId: team.id, userId, role: team.ownerId === userId ? 'owner' : 'member', status: 'active', joinedAt: new Date().toISOString() });
    return team;
  }

  async getTeamOverview(userId: string, weekStart: string): Promise<{ team: TeamRecord; members: Array<{ userId: string; nickname: string; planTier: UserAccount['planTier']; points: number; role: 'owner' | 'member' }> } | undefined> {
    const membership = [...this.memberships.values()].find(item => item.userId === userId && item.status === 'active');
    if (!membership) return undefined;
    const team = this.teams.get(membership.teamId);
    if (!team) return undefined;
    const members = [...this.memberships.values()].filter(item => item.teamId === team.id && item.status === 'active').map(item => {
      const user = this.users.get(item.userId);
      const points = [...this.pointLedger.values()].filter(entry => entry.userId === item.userId && entry.createdAt >= weekStart).reduce((sum, entry) => sum + entry.points, 0);
      return { userId: item.userId, nickname: user?.nickname ?? '学习伙伴', planTier: user?.planTier ?? 'standard', points, role: item.role };
    }).sort((a, b) => b.points - a.points);
    return { team, members };
  }

  async createReaction(teamId: string, senderId: string, receiverId: string, messageKey: string) {
    const reaction = { id: randomUUID(), teamId, senderId, receiverId, messageKey, createdAt: new Date().toISOString() };
    this.reactions.set(reaction.id, reaction);
    return { id: reaction.id, createdAt: reaction.createdAt };
  }

  async createChallenge(input: Omit<ChallengeRecord, 'id' | 'createdAt' | 'status'>): Promise<ChallengeRecord> {
    const challenge: ChallengeRecord = { ...input, id: randomUUID(), status: 'open', createdAt: new Date().toISOString() };
    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  async listChallenges(teamId: string): Promise<ChallengeRecord[]> {
    return [...this.challenges.values()].filter(item => item.teamId === teamId);
  }

  async getChallenge(challengeId: string): Promise<ChallengeRecord | undefined> {
    return this.challenges.get(challengeId);
  }

  async startChallenge(challengeId: string, userId: string): Promise<{ participation: ChallengeParticipation; game: GameSessionRecord; duplicate: boolean }> {
    const existing = this.participations.get(`${challengeId}:${userId}`);
    if (existing) return { participation: existing, game: this.gameSessions.get(existing.gameSessionId)!, duplicate: true };
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');
    const game = await this.createGameSession({ userId, gameType: challenge.gameType, mode: 'challenge', questionIds: challenge.questionIds, questionVersions: challenge.questionVersions, rules: challenge.rules });
    const participation: ChallengeParticipation = { id: randomUUID(), challengeId, userId, gameSessionId: game.id, status: 'active', score: 0, correctCount: 0, longestStreak: 0, startedAt: new Date().toISOString() };
    this.participations.set(`${challengeId}:${userId}`, participation);
    return { participation, game, duplicate: false };
  }

  async finishChallengeParticipation(challengeId: string, userId: string, game: GameSessionRecord): Promise<ChallengeParticipation | undefined> {
    const participation = this.participations.get(`${challengeId}:${userId}`);
    if (!participation) return undefined;
    participation.status = 'finished';
    participation.score = game.score;
    participation.correctCount = game.correctCount;
    participation.longestStreak = game.longestStreak;
    participation.finishedAt ??= new Date().toISOString();
    return participation;
  }

  async setUserRole(userId: string, role: UserRole): Promise<UserAccount | undefined> {
    const user = this.users.get(userId);
    if (user) user.role = role;
    return user;
  }

  async createAsset(input: Omit<AssetRecord, 'id' | 'createdAt'>): Promise<AssetRecord> {
    const asset: AssetRecord = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.assets.set(asset.id, asset);
    return asset;
  }

  async getAsset(assetId: string): Promise<AssetRecord | undefined> {
    return this.assets.get(assetId);
  }

  async createImport(ownerId: string, assetId: string): Promise<ImportRecord> {
    const now = new Date().toISOString();
    const record: ImportRecord = { id: randomUUID(), ownerId, assetId, status: 'uploaded', errors: [], createdAt: now, updatedAt: now };
    this.imports.set(record.id, record);
    return record;
  }

  async listImports(userId: string, all: boolean): Promise<Array<{ import: ImportRecord; asset: AssetRecord }>> {
    return [...this.imports.values()].filter(record => all || record.ownerId === userId).map(record => ({ import: record, asset: this.assets.get(record.assetId)! })).filter(item => Boolean(item.asset));
  }

  async updateImport(importId: string, status: ImportRecord['status'], reviewerId?: string, errors: string[] = []): Promise<ImportRecord | undefined> {
    const record = this.imports.get(importId);
    if (!record) return undefined;
    record.status = status; record.reviewerId = reviewerId; record.errors = errors; record.updatedAt = new Date().toISOString();
    return record;
  }

  async createContent(input: { kind: string; ownerId?: string; visibility: ContentRecord['visibility']; payload: Record<string, unknown> }): Promise<ContentRecord> {
    const record: ContentRecord = { id: randomUUID(), ...input, version: 1, status: 'draft', createdAt: new Date().toISOString() };
    this.content.set(record.id, [record]);
    return record;
  }

  async createContentVersion(contentItemId: string, payload: Record<string, unknown>): Promise<ContentRecord | undefined> {
    const versions = this.content.get(contentItemId);
    if (!versions?.length) return undefined;
    const previous = versions.at(-1)!;
    const record: ContentRecord = { ...previous, version: previous.version + 1, payload, status: 'draft', createdAt: new Date().toISOString() };
    versions.push(record);
    return record;
  }

  async listContent(): Promise<ContentRecord[]> {
    return [...this.content.values()].map(versions => versions.at(-1)!).filter(Boolean);
  }

  async listPublishedContent(kind: string, userId?: string): Promise<ContentRecord[]> {
    return [...this.content.values()].map(versions => versions.filter(v => v.status === 'published').at(-1)).filter((v): v is ContentRecord => Boolean(v && v.kind === kind && (v.visibility === 'public' || (userId && v.ownerId === userId))));
  }

  async getContentVersion(id: string, version: number): Promise<ContentRecord | undefined> {
    return this.content.get(id)?.find(item => item.version === version);
  }

  async updateContentStatus(contentItemId: string, version: number, status: ContentRecord['status'], _actorUserId?: string, _reason?: string): Promise<ContentRecord | undefined> {
    const record = this.content.get(contentItemId)?.find(item => item.version === version);
    if (record) {
      if (status === 'withdrawn' || status === 'published') for (const item of this.content.get(contentItemId) ?? []) if (item.status === 'published') item.status = 'withdrawn';
      record.status = status;
    }
    return record;
  }
}
