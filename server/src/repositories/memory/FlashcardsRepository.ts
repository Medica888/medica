import { randomUUID } from 'crypto';
import type { Flashcard } from '../../types/index.js';
import type { IFlashcardsRepository } from '../interfaces.js';

export class InMemoryFlashcardsRepository implements IFlashcardsRepository {
  private store = new Map<string, Flashcard>();

  async findByUserId(userId: string): Promise<Flashcard[]> {
    return [...this.store.values()]
      .filter((f) => f.user_id === userId)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  async findById(id: string): Promise<Flashcard | null> {
    return this.store.get(id) ?? null;
  }

  async create(flashcard: Omit<Flashcard, 'id' | 'created_at'>): Promise<Flashcard> {
    const id = randomUUID();
    const record: Flashcard = {
      ...flashcard,
      id,
      subject:                flashcard.subject                ?? '',
      system:                 flashcard.system                 ?? '',
      topic:                  flashcard.topic                  ?? '',
      canonical_topic:        flashcard.canonical_topic        ?? '',
      topic_slug:             flashcard.topic_slug             ?? '',
      source_mode:            flashcard.source_mode            ?? '',
      weak_spot_category:     flashcard.weak_spot_category     ?? '',
      reinforcement_priority: flashcard.reinforcement_priority ?? 'normal',
      review_count:           flashcard.review_count           ?? 0,
      memory_anchor:          flashcard.memory_anchor          ?? null,
      common_trap:            flashcard.common_trap            ?? null,
      source_pearl:           flashcard.source_pearl           ?? null,
      ease:                   flashcard.ease                   ?? null,
      last_missed_reason:     flashcard.last_missed_reason     ?? null,
      created_at: new Date(),
    };
    this.store.set(id, record);
    return record;
  }

  async createMany(flashcards: Omit<Flashcard, 'id' | 'created_at'>[]): Promise<Flashcard[]> {
    return Promise.all(flashcards.map((f) => this.create(f)));
  }

  async updateStatus(id: string, userId: string, status: Flashcard['review_status']): Promise<Flashcard | null> {
    const card = this.store.get(id);
    if (!card || card.user_id !== userId) return null;
    card.review_status = status;
    return card;
  }

  async markReviewed(id: string, userId: string): Promise<Flashcard | null> {
    const card = this.store.get(id);
    if (!card || card.user_id !== userId) return null;
    card.reviewed_at = new Date();
    card.review_count = (card.review_count ?? 0) + 1;
    if (card.review_status === 'new') card.review_status = 'learning';
    return card;
  }

  async deleteByUserId(userId: string): Promise<number> {
    let count = 0;
    for (const [id, card] of this.store.entries()) {
      if (card.user_id === userId) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  _clear(): void {
    this.store.clear();
  }
}
