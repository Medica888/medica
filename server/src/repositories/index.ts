import { getPool } from '../config/db.js';

import { InMemoryUsersRepository } from './memory/UsersRepository.js';
import { InMemoryExamSessionsRepository } from './memory/ExamSessionsRepository.js';
import { InMemoryQuestionAttemptsRepository } from './memory/QuestionAttemptsRepository.js';
import { InMemoryFlashcardsRepository } from './memory/FlashcardsRepository.js';
import { InMemoryAnalyticsRepository } from './memory/AnalyticsRepository.js';
import { InMemoryQuestionsRepository } from './memory/QuestionsRepository.js';
import { InMemoryConceptsRepository } from './memory/ConceptsRepository.js';
import { InMemoryQuestionConceptsRepository } from './memory/QuestionConceptsRepository.js';
import { InMemoryUserConceptMasteryRepository } from './memory/UserConceptMasteryRepository.js';
import { InMemoryMasterySnapshotsRepository } from './memory/MasterySnapshotsRepository.js';
import { InMemoryConceptReviewLogRepository } from './memory/ConceptReviewLogRepository.js';
import { InMemoryQuestionReportsRepository } from './memory/QuestionReportsRepository.js';
import { InMemoryAuditLogRepository } from './memory/AuditLogRepository.js';
import { InMemoryTaxonomyCandidatesRepository } from './memory/TaxonomyCandidatesRepository.js';

import { PgUsersRepository } from './pg/UsersRepository.js';
import { PgExamSessionsRepository } from './pg/ExamSessionsRepository.js';
import { PgQuestionAttemptsRepository } from './pg/QuestionAttemptsRepository.js';
import { PgFlashcardsRepository } from './pg/FlashcardsRepository.js';
import { PgAnalyticsRepository } from './pg/AnalyticsRepository.js';
import { PgQuestionsRepository } from './pg/QuestionsRepository.js';
import { PgConceptsRepository } from './pg/ConceptsRepository.js';
import { PgQuestionConceptsRepository } from './pg/QuestionConceptsRepository.js';
import { PgUserConceptMasteryRepository } from './pg/UserConceptMasteryRepository.js';
import { PgMasterySnapshotsRepository } from './pg/MasterySnapshotsRepository.js';
import { PgConceptReviewLogRepository } from './pg/ConceptReviewLogRepository.js';
import { PgQuestionReportsRepository } from './pg/QuestionReportsRepository.js';
import { PgAuditLogRepository } from './pg/AuditLogRepository.js';
import { PgTaxonomyCandidatesRepository } from './pg/TaxonomyCandidatesRepository.js';

import type { IUsersRepository } from './interfaces.js';
import type { IExamSessionsRepository } from './interfaces.js';
import type { IQuestionAttemptsRepository } from './interfaces.js';
import type { IFlashcardsRepository } from './interfaces.js';
import type { IAnalyticsRepository } from './interfaces.js';
import type { IQuestionsRepository } from './interfaces.js';
import type { IConceptsRepository } from './interfaces.js';
import type { IQuestionConceptsRepository } from './interfaces.js';
import type { IUserConceptMasteryRepository } from './interfaces.js';
import type { IMasterySnapshotsRepository } from './interfaces.js';
import type { IConceptReviewLogRepository } from './interfaces.js';
import type { IQuestionReportsRepository } from './interfaces.js';
import type { IAuditLogRepository } from './interfaces.js';
import type { ITaxonomyCandidatesRepository } from './interfaces.js';

import { config } from '../config.js';

export interface Repositories {
  users: IUsersRepository;
  examSessions: IExamSessionsRepository;
  questionAttempts: IQuestionAttemptsRepository;
  flashcards: IFlashcardsRepository;
  analytics: IAnalyticsRepository;
  questions: IQuestionsRepository;
  concepts: IConceptsRepository;
  questionConcepts: IQuestionConceptsRepository;
  userConceptMastery: IUserConceptMasteryRepository;
  masterySnapshots:   IMasterySnapshotsRepository;
  reviewLog:          IConceptReviewLogRepository;
  questionReports:    IQuestionReportsRepository;
  auditLog:           IAuditLogRepository;
  taxonomyCandidates: ITaxonomyCandidatesRepository;
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
    users:              new InMemoryUsersRepository(),
    examSessions:       new InMemoryExamSessionsRepository(),
    questionAttempts:   new InMemoryQuestionAttemptsRepository(),
    flashcards:         new InMemoryFlashcardsRepository(),
    analytics:          new InMemoryAnalyticsRepository(),
    questions:          new InMemoryQuestionsRepository(),
    concepts:           new InMemoryConceptsRepository(),
    questionConcepts:   new InMemoryQuestionConceptsRepository(),
    userConceptMastery: new InMemoryUserConceptMasteryRepository(),
    masterySnapshots:   new InMemoryMasterySnapshotsRepository(),
    reviewLog:          new InMemoryConceptReviewLogRepository(),
    questionReports:    new InMemoryQuestionReportsRepository(),
    auditLog:           new InMemoryAuditLogRepository(),
    taxonomyCandidates: new InMemoryTaxonomyCandidatesRepository(),
  };
}

export function createPgRepositories(): Repositories {
  const pool = getPool();
  if (!pool) throw new Error('[db] createPgRepositories called without DATABASE_URL');
  return {
    users:              new PgUsersRepository(pool),
    examSessions:       new PgExamSessionsRepository(pool),
    questionAttempts:   new PgQuestionAttemptsRepository(pool),
    flashcards:         new PgFlashcardsRepository(pool),
    analytics:          new PgAnalyticsRepository(pool),
    questions:          new PgQuestionsRepository(pool),
    concepts:           new PgConceptsRepository(pool),
    questionConcepts:   new PgQuestionConceptsRepository(pool),
    userConceptMastery: new PgUserConceptMasteryRepository(pool),
    masterySnapshots:   new PgMasterySnapshotsRepository(pool),
    reviewLog:          new PgConceptReviewLogRepository(pool),
    questionReports:    new PgQuestionReportsRepository(pool),
    auditLog:           new PgAuditLogRepository(pool),
    taxonomyCandidates: new PgTaxonomyCandidatesRepository(pool),
  };
}

/** Overrides the singleton — useful in tests */
export function setRepositories(repos: Repositories): void {
  _repos = repos;
}
