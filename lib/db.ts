// lib/db.ts
import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER!,        // ej: "localhost" o "tu-servidor.database.windows.net"
  database: process.env.DB_DATABASE!,        // "RagLearningDb"
  user: process.env.DB_USER!,            // "sa" o tu usuario
  password: process.env.DB_PASSWORD!,  // Reemplaza con tu contraseña real
  port: 1433,
  options: {
    encrypt: true,                        // true si usas Azure SQL o SQL Server con TLS
    trustServerCertificate: true,         // true solo en desarrollo local
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Evita crear múltiples pools durante hot-reload en desarrollo (App Router)
declare global {
  // eslint-disable-next-line no-var
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