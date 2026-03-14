import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from './index';
import { schemaStatements, triggerStatements } from '../database/schema';

const useSsl = Boolean(config.database.url) || config.nodeEnv === 'production';

const poolConfig = config.database.url
  ? {
      connectionString: config.database.url,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    }
  : {
      host: config.database.host,
      port: config.database.port,
      user: config.database.username,
      password: config.database.password,
      database: config.database.database,
      ssl: useSsl ? { rejectUnauthorized: false } : false
    };

export const dbPool = new Pool(poolConfig);

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> => {
  return dbPool.query<T>(text, params);
};

export const withTransaction = async <T>(
  work: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const initializeSchema = async (): Promise<void> => {
  const client = await dbPool.connect();

  try {
    for (const statement of schemaStatements) {
      await client.query(statement);
    }

    for (const statement of triggerStatements) {
      await client.query(statement);
    }

    console.log('✅ Database schema checked/created successfully');
  } finally {
    client.release();
  }
};

export const connectDatabase = async (): Promise<void> => {
  try {
    await dbPool.query('SELECT 1');
    console.log('✅ PostgreSQL connection established');

    await initializeSchema();
  } catch (error) {
    console.error('❌ Failed to initialize PostgreSQL:', error);
    process.exit(1);
  }
};

export const closeDatabase = async (): Promise<void> => {
  await dbPool.end();
};
