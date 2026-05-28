import type { IFlashcardsRepository } from '../repositories/interfaces.js';
import type { Flashcard } from '../types/index.js';
import type { CreateFlashcardInput } from '../schemas/flashcard.js';

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

  async markReviewed(id: string, userId: string): Promise<Flashcard> {
    const updated = await this.flashcards.markReviewed(id, userId);
    if (!updated) throw new Error('NOT_FOUND');
    return updated;
  }

  async clearAll(userId: string): Promise<number> {
    return this.flashcards.deleteByUserId(userId);
  }
}
