import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'username',
      credentials: {
        username: { label: '账号', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) return null;

        const user = await prisma.user.findUnique({
          where: { username: credentials.username },
          include: { team: { include: { tournament: true } } },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        // Team accounts of an archived tournament cannot log in.
        if (user.role === 'CAPTAIN') {
          if (!user.team || user.team.tournament.status === 'ARCHIVED') return null;
        }

        return {
          id: user.id,
          username: user.username,
          role: user.role,
          mustChangePwd: user.mustChangePwd,
          teamId: user.team?.id ?? null,
          tournamentId: user.team?.tournamentId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.mustChangePwd = user.mustChangePwd;
        token.teamId = user.teamId;
        token.tournamentId = user.tournamentId;
      }
      if (trigger === 'update' && session?.mustChangePwd === false) {
        token.mustChangePwd = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        username: token.username,
        role: token.role,
        mustChangePwd: token.mustChangePwd,
        teamId: token.teamId,
        tournamentId: token.tournamentId,
      };
      return session;
    },
  },
};

export const getSession = () => getServerSession(authOptions);
