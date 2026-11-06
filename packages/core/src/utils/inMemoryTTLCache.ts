export class InMemoryTTLCache<Key extends string, Value> {
  public data = new Map<Key, Value>();
  protected timers = new Map<Key, NodeJS.Timeout>();

  constructor(protected ttl: number) {}

  set(key: Key, v: Value) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    this.timers.set(
      key,
      setTimeout(() => this.delete(key), this.ttl)
    );
    this.data.set(key, v);
  }

  get(key: Key) {
    return this.data.get(key);
  }

  has(key: Key) {
    return this.data.has(key);
  }

  delete(key: Key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }
    this.timers.delete(key);
    return this.data.delete(key);
  }

  clear() {
    this.data.clear();
    for (const v of this.timers.values()) {
      clearTimeout(v);
    }
    this.timers.clear();
  }
}
