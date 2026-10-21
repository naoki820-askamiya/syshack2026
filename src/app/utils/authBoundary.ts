export interface AuthBoundary {
  readonly userId: string | null;
  readonly epoch: number;
}

let current: AuthBoundary = { userId: null, epoch: 0 };
const listeners = new Set<() => void>();

export function captureAuthBoundary(): AuthBoundary {
  return current;
}

export function isCurrentAuthBoundary(boundary: AuthBoundary): boolean {
  return boundary.userId !== null && boundary.userId === current.userId && boundary.epoch === current.epoch;
}

export function assertCurrentAuthBoundary(boundary: AuthBoundary): void {
  if (!isCurrentAuthBoundary(boundary)) throw new Error('ログイン状態が変わりました。もう一度操作してください。');
}

// Publish the boundary synchronously, before React publishes the next auth user.
export function setAuthenticatedUser(userId: string | null, options: { newSession?: boolean } = {}): AuthBoundary {
  if (userId !== current.userId || options.newSession) {
    current = { userId, epoch: current.epoch + 1 };
    listeners.forEach((listener) => listener());
  }
  return current;
}

export function subscribeAuthBoundary(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}


export function finishExplicitLogin(start: AuthBoundary, returnedUserId: string | null, superseded = false): AuthBoundary {
  if (!superseded && returnedUserId === start.userId && isCurrentAuthBoundary(start)) {
    return setAuthenticatedUser(returnedUserId, { newSession: true });
  }
  return current;
}
