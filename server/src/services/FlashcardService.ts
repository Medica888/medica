import type { IFlashcardsRepository, FlashcardSrsUpdate } from '../repositories/interfaces.js';
import type { Flashcard } from '../types/index.js';
import type { CreateFlashcardInput } from '../schemas/flashcard.js';

const MAX_INTERVAL = 365;
const VALID_EASE = new Set(['again', 'hard', 'good', 'easy']);

function _computeFlashcardSrs(card: Flashcard | null, ease?: string): FlashcardSrsUpdate {
  const now = new Date();
  const currentInterval = card?.interval_days ?? 0;
  const currentCount    = card?.review_count ?? 0;

  if (!ease || !VALID_EASE.has(ease)) {
    return {
      reviewed_at:   now,
      review_count:  currentCount + 1,
      review_status: card?.review_status === 'new' ? 'learning' : (card?.review_status ?? 'learning'),
      ease:          null,
      interval_days: currentInterval,
      next_review:   card?.next_review ?? null,
    };
  }

  const reviewCount = currentCount + 1;
  let interval: number;
  let review_status: Flashcard['review_status'];

  switch (ease as 'again' | 'hard' | 'good' | 'easy') {
    case 'again':
      interval      = 0;
      review_status = 'learning';
      break;
    case 'hard':
      interval      = Math.min(MAX_INTERVAL, Math.max(1, Math.round(currentInterval * 1.2)));
      review_status = 'learning';
      break;
    case 'good':
      interval      = currentInterval === 0 ? 3 : Math.min(MAX_INTERVAL, Math.round(currentInterval * 2.5));
      review_status = reviewCount >= 3 ? 'mastered' : 'learning';
      break;
    case 'easy':
      interval      = currentInterval === 0 ? 7 : Math.min(MAX_INTERVAL, Math.round(currentInterval * 3.5));
      review_status = 'mastered';
      break;
  }

  const next_review = new Date(now);
  next_review.setDate(next_review.getDate() + interval);

  return { reviewed_at: now, review_count: reviewCount, review_status, ease, interval_days: interval, next_review };
}

export class FlashcardService {
  constructor(private flashcards: IFlashcardsRepository) {}

  async getFlashcards(userId: string): Promise<Flashcard[]> {
    return this.flashcards.findByUserId(userId);
  }

  async createMany(userId: string, inputs: CreateFlashcardInput[]): Promise<Flashcard[]> {
    return this.flashcards.createMany(
      inputs.map((f) => ({ user_id: userId, ...f })),
    );
  }

  async updateStatus(id: string, userId: string, status: Flashcard['review_status']): Promise<Flashcard> {
    const updated = await this.flashcards.updateStatus(id, userId, status);
    if (!updated) throw new Error('NOT_FOUND');
    return updated;
  }

  async markReviewed(id: string, userId: string, ease?: string): Promise<Flashcard> {
    const existing = await this.flashcards.findById(id);
    const srs      = _computeFlashcardSrs(existing, ease);
    const updated  = await this.flashcards.markReviewed(id, userId, srs);
    if (!updated) throw new Error('NOT_FOUND');
    return updated;
  }

  async clearAll(userId: string): Promise<number> {
    return this.flashcards.deleteByUserId(userId);
  }
}
