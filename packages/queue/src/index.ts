import PgBoss from 'pg-boss'

let boss: PgBoss | null = null

export async function getQueue(): Promise<PgBoss> {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!)
    await boss.start()
  }
  return boss
}

export const JOBS = {
  DELIVER_EVENT: 'deliver-event',
} as const

export interface DeliverEventPayload {
  eventId: string
}

export async function enqueueDelivery(eventId: string) {
  const queue = await getQueue()
  await queue.send(
    JOBS.DELIVER_EVENT,
    { eventId } satisfies DeliverEventPayload,
    {
      retryLimit:   7,
      retryDelay:   5,    // primer reintento en 5s
      retryBackoff: true, // backoff exponencial automático
      expireInHours: 24,
    }
  )
}
