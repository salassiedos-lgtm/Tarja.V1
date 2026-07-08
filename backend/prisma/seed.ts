import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 16 accesorios en el orden de la ficha oficial (columna izquierda, luego derecha).
const ACCESSORIES = [
  'Radio',
  'Reloj',
  'Encendedor',
  'Ceniceros',
  'Espejos interiores',
  'Espejos laterales',
  'Antena',
  'Pisos adicionales',
  'Plumillas',
  'Tapa de llanta',
  'Llanta de repuesto',
  'Gata',
  'Herramientas',
  'Llaves del vehiculo',
  'Catalogos',
  'Relays',
];

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

  for (let i = 0; i < ACCESSORIES.length; i++) {
    const name = ACCESSORIES[i];
    await prisma.accessory.upsert({
      where: { name },
      update: { sortOrder: i + 1 },
      create: { name, sortOrder: i + 1 },
    });
  }

  console.log(
    `Seed OK: 3 roles, usuario admin (admin / Admin123!), ${ACCESSORIES.length} accesorios`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
