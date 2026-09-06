const prisma = require('../../config/prisma');

async function main() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        gymId: true,
        branchId: true,
        memberId: true,
        isActive: true,
        isVerified: true
      },
      orderBy: { role: 'asc' }
    });

    const gyms = await prisma.gym.findMany({ select: { id: true, name: true } });
    const branches = await prisma.branch.findMany({ select: { id: true, name: true, gymId: true } });

    const gymMap = Object.fromEntries(gyms.map(g => [g.id, g.name]));
    const branchMap = Object.fromEntries(branches.map(b => [b.id, b.name]));

    const result = users.map(u => ({
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      gymName: gymMap[u.gymId] || u.gymId,
      branchName: branchMap[u.branchId] || u.branchId || 'None',
      isVerified: u.isVerified
    }));

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
