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

async function upsertUser(
  username: string,
  name: string,
  lastname: string,
  role: RoleName,
  password: string,
  initials: string,
) {
  const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      name,
      lastname,
      username,
      email: `${username}@cspcp.local`,
      passwordHash,
      initials,
      roleId: r.id,
    },
  });
}

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

  await upsertUser('admin', 'Administrador', 'Sistema', 'ADMIN', 'Admin123!', 'ADM');
  await upsertUser('supervisor', 'Supervisor', 'Sistema', 'SUPERVISOR', 'Super123!', 'SUP');
  await upsertUser('tarjador', 'Tarjador', 'Uno', 'TARJADOR', 'Tarja123!', 'TJ1');

  for (let i = 0; i < ACCESSORIES.length; i++) {
    const name = ACCESSORIES[i];
    await prisma.accessory.upsert({
      where: { name },
      update: { sortOrder: i + 1 },
      create: { name, sortOrder: i + 1 },
    });
  }

  console.log(
    `Seed OK: roles + usuarios (admin/Admin123!, supervisor/Super123!, tarjador/Tarja123!), ${ACCESSORIES.length} accesorios`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
