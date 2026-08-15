const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const roles = await prisma.role.count();
  const schools = await prisma.school.count();
  const sample = await prisma.user.findMany({
    select: { email: true, username: true, status: true },
    take: 10,
  });
  console.log(JSON.stringify({ users, roles, schools, sample }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
