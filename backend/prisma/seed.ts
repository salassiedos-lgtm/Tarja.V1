import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const roles: { name: RoleName; description: string }[] = [
    { name: 'ADMIN', description: 'Administrador' },
    { name: 'SUPERVISOR', description: 'Supervisor' },
    { name: 'TARJADOR', description: 'Tarjador' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  const admin = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'Administrador',
      lastname: 'Sistema',
      username: 'admin',
      email: 'admin@cspcp.local',
      passwordHash,
      initials: 'ADM',
      roleId: admin.id,
    },
  });
  console.log('Seed OK: roles + usuario admin (admin / Admin123!)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
