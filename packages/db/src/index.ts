import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!, {
  max: 10, // pool de conexiones
})

export const db = drizzle(client, { schema })

// Re-exportar schema para que los apps importen desde un solo lugar
export * from './schema'
export * from './plans'
