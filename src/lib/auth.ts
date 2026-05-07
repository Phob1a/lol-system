import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'gameId',
      credentials: {
        gameId: { label: '游戏 ID', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.gameId || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { gameId: credentials.gameId.trim() },
          include: {
            player: {
              select: { isCaptain: true, isRetired: true, nickname: true },
            },
          },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          gameId: user.gameId,
          role: user.role,
          mustChangePwd: user.mustChangePwd,
          // For captains, expose draft eligibility flags so middleware can gate /captain.
          isCaptain: user.player?.isCaptain ?? false,
          isRetired: user.player?.isRetired ?? false,
          nickname: user.player?.nickname ?? user.gameId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.gameId = user.gameId;
        token.role = user.role;
        token.mustChangePwd = user.mustChangePwd;
        token.isCaptain = user.isCaptain;
        token.isRetired = user.isRetired;
        token.nickname = user.nickname;
      }
      // After change-password completes, the page calls update({ mustChangePwd: false }).
      if (trigger === 'update' && session?.mustChangePwd === false) {
        token.mustChangePwd = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        gameId: token.gameId as string,
        role: token.role as 'ADMIN' | 'CAPTAIN',
        mustChangePwd: token.mustChangePwd as boolean,
        isCaptain: token.isCaptain as boolean,
        isRetired: token.isRetired as boolean,
        nickname: token.nickname as string,
      };
      return session;
    },
  },
};

// Convenience helper for server components.
import { getServerSession } from 'next-auth';
export const getSession = () => getServerSession(authOptions);
