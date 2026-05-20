import type { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
      mustChangePwd: boolean;
      teamId: string | null;
      seasonId: string | null;
    };
  }
  interface User {
    id: string;
    username: string;
    role: Role;
    mustChangePwd: boolean;
    teamId: string | null;
    seasonId: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    username: string;
    role: Role;
    mustChangePwd: boolean;
    teamId: string | null;
    seasonId: string | null;
  }
}
