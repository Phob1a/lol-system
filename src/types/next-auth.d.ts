import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {
    id: string;
    gameId: string;
    role: 'ADMIN' | 'CAPTAIN';
    mustChangePwd: boolean;
    isCaptain: boolean;
    isRetired: boolean;
    nickname: string;
  }

  interface Session {
    user: {
      id: string;
      gameId: string;
      role: 'ADMIN' | 'CAPTAIN';
      mustChangePwd: boolean;
      isCaptain: boolean;
      isRetired: boolean;
      nickname: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    gameId: string;
    role: 'ADMIN' | 'CAPTAIN';
    mustChangePwd: boolean;
    isCaptain: boolean;
    isRetired: boolean;
    nickname: string;
  }
}
