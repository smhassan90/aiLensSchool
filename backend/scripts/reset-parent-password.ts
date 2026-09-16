import { PrismaClient, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const USERNAME = 'dtps.f.53';
const PASSWORD = 'Password123';

async function main() {
  const user = await prisma.user.findFirst({
    where: { username: USERNAME },
    include: { roles: { include: { role: true } } },
  });

  if (!user) {
    const dtpsCount = await prisma.user.count({
      where: { username: { startsWith: 'dtps.' } },
    });
    console.log(JSON.stringify({ found: false, dtpsUserCount: dtpsCount }));
    return;
  }

  const roles = user.roles.map((r) => r.role.name);
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      mustChangePassword: true,
      status: UserStatus.ACTIVE,
    },
  });

  console.log(
    JSON.stringify({
      found: true,
      username: user.username,
      status: user.status,
      roles,
      passwordReset: true,
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
