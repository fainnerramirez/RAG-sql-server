// lib/db.ts
import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER!,        
  database: process.env.DB_NAME!,   
  user: process.env.DB_USER!,            
  password: process.env.DB_PASSWORD!, 
  port: 1433,
  options: {
    encrypt: true,                        
    trustServerCertificate: true,        
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

declare global {
  var _sqlPool: sql.ConnectionPool | undefined;
}

export async function getPool(): Promise<sql.ConnectionPool> {
  try {
    if (global._sqlPool && global._sqlPool.connected) {
      return global._sqlPool;
    }

    const pool = new sql.ConnectionPool(config);
    global._sqlPool = pool;

    pool.on("error", (err) => {
      console.error("SQL Pool error:", err);
    });

    await pool.connect();
    return pool;
  } catch (error) {
    console.error("Error al conectar a la base de datos:", error);
    throw error;
  }
}