import { getPool } from '../config/db.js';

import { InMemoryUsersRepository } from './memory/UsersRepository.js';
import { InMemoryExamSessionsRepository } from './memory/ExamSessionsRepository.js';
import { InMemoryQuestionAttemptsRepository } from './memory/QuestionAttemptsRepository.js';
import { InMemoryFlashcardsRepository } from './memory/FlashcardsRepository.js';
import { InMemoryAnalyticsRepository } from './memory/AnalyticsRepository.js';
import { InMemoryQuestionsRepository } from './memory/QuestionsRepository.js';

import { PgUsersRepository } from './pg/UsersRepository.js';
import { PgExamSessionsRepository } from './pg/ExamSessionsRepository.js';
import { PgQuestionAttemptsRepository } from './pg/QuestionAttemptsRepository.js';
import { PgFlashcardsRepository } from './pg/FlashcardsRepository.js';
import { PgAnalyticsRepository } from './pg/AnalyticsRepository.js';
import { PgQuestionsRepository } from './pg/QuestionsRepository.js';

import type { IUsersRepository } from './interfaces.js';
import type { IExamSessionsRepository } from './interfaces.js';
import type { IQuestionAttemptsRepository } from './interfaces.js';
import type { IFlashcardsRepository } from './interfaces.js';
import type { IAnalyticsRepository } from './interfaces.js';
import type { IQuestionsRepository } from './interfaces.js';

import { config } from '../config.js';

export interface Repositories {
  users: IUsersRepository;
  examSessions: IExamSessionsRepository;
  questionAttempts: IQuestionAttemptsRepository;
  flashcards: IFlashcardsRepository;
  analytics: IAnalyticsRepository;
  questions: IQuestionsRepository;
}

let _repos: Repositories | null = null;

export function getRepositories(): Repositories {
  if (!_repos) {
    _repos = config.databaseUrl
      ? createPgRepositories()
      : createInMemoryRepositories();
  }
  return _repos;
}

export function createInMemoryRepositories(): Repositories {
  return {
    users: new InMemoryUsersRepository(),
    examSessions: new InMemoryExamSessionsRepository(),
    questionAttempts: new InMemoryQuestionAttemptsRepository(),
    flashcards: new InMemoryFlashcardsRepository(),
    analytics: new InMemoryAnalyticsRepository(),
    questions: new InMemoryQuestionsRepository(),
  };
}

export function createPgRepositories(): Repositories {
  const pool = getPool();
  if (!pool) throw new Error('[db] createPgRepositories called without DATABASE_URL');
  return {
    users: new PgUsersRepository(pool),
    examSessions: new PgExamSessionsRepository(pool),
    questionAttempts: new PgQuestionAttemptsRepository(pool),
    flashcards: new PgFlashcardsRepository(pool),
    analytics: new PgAnalyticsRepository(pool),
    questions: new PgQuestionsRepository(pool),
  };
}

/** Overrides the singleton — useful in tests */
export function setRepositories(repos: Repositories): void {
  _repos = repos;
}
