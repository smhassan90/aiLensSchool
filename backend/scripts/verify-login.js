const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { roles: { include: { role: true } } },
  });

  const checks = [];
  for (const user of users) {
    const passwords = {
      'superadmin@example.com': 'SuperAdmin123!',
      'admin@abcschool.com': 'SchoolAdmin123!',
      'teacher@abcschool.com': 'Teacher123!',
      'parent1@example.com': 'Parent123!',
      'parent2@example.com': 'Parent123!',
    };
    const password = passwords[user.email];
    const valid = password ? await bcrypt.compare(password, user.passwordHash) : null;
    checks.push({
      email: user.email,
      username: user.username,
      status: user.status,
      roles: user.roles.map((r) => ({ name: r.role.name, schoolId: r.schoolId })),
      passwordOk: valid,
      hashPrefix: user.passwordHash.slice(0, 7),
    });
  }
  console.log(JSON.stringify(checks, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
