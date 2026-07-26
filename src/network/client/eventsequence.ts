export class EventSequenceWindow {
  private readonly seen = new Set<string>()
  private readonly order: string[] = []

  constructor(private readonly capacity = 512) {}

  accept(sequence?: string): boolean {
    if (!sequence) return true
    if (this.seen.has(sequence)) return false
    this.seen.add(sequence)
    this.order.push(sequence)
    if (this.order.length > this.capacity) {
      const oldest = this.order.shift()
      if (oldest) this.seen.delete(oldest)
    }
    return true
  }

  clear(): void {
    this.seen.clear()
    this.order.length = 0
  }
}
