/** A typed publish–subscribe channel whose listeners can be counted and cleared. */
export type EventEmitter<Event> = {
  /** Delivers `event` to every current listener, in subscription order. */
  publish(event: Event): void;
  /**
   * Adds a listener until the returned function is called; calling it again does nothing.
   * Subscribing the same function twice delivers each event to it twice.
   */
  subscribe(listener: (event: Event) => void): () => void;
  listenerCount(): number;
  /** Removes every listener. */
  clear(): void;
};

export function createEmitter<Event>(): EventEmitter<Event> {
  const listeners = new Set<(event: Event) => void>();

  return {
    publish(event) {
      // A listener that unsubscribes others mid-delivery must not change who receives this event.
      for (const listener of [...listeners]) listener(event);
    },
    subscribe(listener) {
      const entry = (event: Event) => listener(event);
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
    listenerCount: () => listeners.size,
    clear() {
      listeners.clear();
    },
  };
}
