const mysql = require('mysql2/promise');

async function main() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'sms',
    password: 'smspassword',
  });

  console.log('connected as sms');
  const [rows] = await connection.query('SELECT USER() AS user, CURRENT_USER() AS currentUser, @@version AS version');
  console.log(rows);

  await connection.query(
    'CREATE DATABASE IF NOT EXISTS sms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  );

  try {
    await connection.query("ALTER USER 'sms'@'%' IDENTIFIED WITH mysql_native_password BY 'smspassword'");
  } catch (error) {
    console.warn('skip sms@%:', error.message);
  }

  try {
    await connection.query("ALTER USER 'sms'@'localhost' IDENTIFIED WITH mysql_native_password BY 'smspassword'");
  } catch (error) {
    console.warn('skip sms@localhost:', error.message);
  }

  await connection.query('FLUSH PRIVILEGES');
  console.log('db ready, auth plugin updated');
  await connection.end();
}

main().catch((error) => {
  console.error('FAIL', error.code, error.message);
  process.exit(1);
});
