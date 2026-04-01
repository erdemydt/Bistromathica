interface BasicUser {
  id: string;
  role: string;
}

export function canEditPost(user: BasicUser | null, authorId: string): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.id === authorId;
}