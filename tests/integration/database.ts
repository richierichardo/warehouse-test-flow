import "dotenv/config";

function databaseIdentity(url: URL) {
  const hostname = url.hostname.toLowerCase();
  const host = ["localhost", "[::1]"].includes(hostname) ? "127.0.0.1" : hostname;
  return `${host}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("Set TEST_DATABASE_URL ke PostgreSQL khusus tes.");

  const test = new URL(value);
  const name = decodeURIComponent(test.pathname.slice(1));
  if (!/^warehouse_test(?:_[a-z0-9_]+)?$/.test(name)) {
    throw new Error("Gunakan database warehouse_test atau warehouse_test_<suffix> khusus tes.");
  }

  if (process.env.DATABASE_URL && databaseIdentity(test) === databaseIdentity(new URL(process.env.DATABASE_URL))) {
    throw new Error("TEST_DATABASE_URL harus mengarah ke database yang berbeda dari DATABASE_URL.");
  }

  return value;
}
