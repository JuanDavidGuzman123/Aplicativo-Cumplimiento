import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';

  if (!email || !password) {
    console.log(
      'Seed omitido: SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD no están configurados.',
    );
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    console.log(`El administrador ${email} ya existe. No se realizaron cambios.`);
    return;
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  await prisma.user.create({
    data: {
      name: process.env.SEED_ADMIN_NAME ?? 'Administrador',
      email,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Administrador ${email} creado.`);
}

main()
  .catch((error) => {
    console.error('Error al crear el administrador:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
