import { describe, expect, it } from 'vitest';
import { canEditPost } from './permissions';

describe('canEditPost', () => {
  it('returns true for post author', () => {
    const user = { id: 'author-1', role: 'user' };
    expect(canEditPost(user, 'author-1')).toBe(true);
  });

  it('returns true for admin', () => {
    const user = { id: 'admin-1', role: 'admin' };
    expect(canEditPost(user, 'author-1')).toBe(true);
  });

  it('returns false for another non-admin user', () => {
    const user = { id: 'user-2', role: 'user' };
    expect(canEditPost(user, 'author-1')).toBe(false);
  });

  it('returns false for anonymous user', () => {
    expect(canEditPost(null, 'author-1')).toBe(false);
  });
});
